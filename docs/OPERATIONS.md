# Operations guide

How to run, back up, update and troubleshoot Java Mastery Quest. The stack is defined in `compose.yaml`
(repository root); images are built from `web/Dockerfile` and `runner/Dockerfile`.

> Read **Verification status** at the end: the Docker images and the Compose stack were written in a
> sandbox without a Docker daemon or registry access. Everything that could be executed there was;
> the container build/run itself was not.

---

## 1. Start

Requirements: Docker Engine 24+ with **Docker Compose v2.20+** (for `depends_on.required`), about 2 GB of
free RAM, and internet access for the first build (base images and npm packages).

```sh
cp .env.example .env            # then edit POSTGRES_PASSWORD and RUNNER_TOKEN (openssl rand -hex 32)
docker compose up --build       # first start: builds 3 images, initialises the database, seeds content
```

Add `-d` to run in the background. Start-up order is handled by Compose:
`db` healthy → `migrate` runs and exits 0 → `web` starts. `runner` starts in parallel and is optional.

Check it:

```sh
docker compose ps                                  # web/db/runner "healthy", migrate "exited (0)"
scripts/smoke-test.sh                              # health + main pages, exit code 0 = OK
SMOKE_WAIT=90 scripts/smoke-test.sh                # same, but waits for the app to come up first
```

### URLs

| What        | URL                                   | Notes                                              |
|-------------|---------------------------------------|----------------------------------------------------|
| App         | http://127.0.0.1:3000                 | `WEB_PORT` in `.env` changes the host port         |
| Health      | http://127.0.0.1:3000/api/health      | 200 + `"status":"ok"` when the database is reachable; also reports the runner |
| PostgreSQL  | not published                         | only reachable from the `backend` network          |
| Runner      | not published                         | only reachable from `web` on the internal `runner-net` |

The app has no login (single local learner, `docs/DECISIONS.md` D-006), so it is published on
**127.0.0.1 only**. Do not change the port mapping to `0.0.0.0` on a shared network.

## 2. Services

| Service   | Image (built locally)                | Role |
|-----------|--------------------------------------|------|
| `db`      | `postgres:17-bookworm`               | PostgreSQL. Data in the named volume `jmq-pgdata`. Healthcheck: `pg_isready`. |
| `migrate` | `java-mastery-quest/web-tools:local` (`web/Dockerfile`, target `tools`) | One-shot job: `npm run migrate` (applies `db/migrations/*.sql` once each, advisory-locked, checksum-guarded) then `npm run seed` (validates `/content` and upserts it; never touches learner tables). Runs on every `docker compose up`; both steps are idempotent. |
| `web`     | `java-mastery-quest/web:local` (target `runtime`) | Next.js standalone server: UI + HTTP API. Non-root (`node`), `cap_drop: ALL`, `no-new-privileges`, `init: true`. Healthcheck: `node -e fetch(/api/health)`. Reads `content/readiness.yaml` at runtime from `/app/content`. |
| `runner`  | `java-mastery-quest/runner:local` (`runner/Dockerfile`) | Java 25 code runner (compile + run learner code). Hardened, see §3. Healthcheck: `java … dev.jmq.runner.HealthCheck`. |

Networks: `backend` (db, migrate, web) and `runner-net` (web, runner; `internal: true`).
Images mirror the repository layout (`/app/web`, `/app/content`, `/app/db/migrations`), so the code's
relative defaults (`../content`, `../db/migrations`) hold; `CONTENT_DIR` / `MIGRATIONS_DIR` are also set
explicitly.

## 3. The runner's isolation model (and its limits)

**Per run** (implemented in `runner/src/dev/jmq/runner/JavaSandbox.java`):
compiled in-process with `javax.tools` and `-proc:none` (no annotation processors, so no learner code runs at
compile time); executed in a **separate child JVM** with `-Xmx128m` (`RUNNER_MAX_HEAP_MB`), `-Xss1m`,
a wall-clock timeout (the app asks for 5 s; capped by `RUNNER_MAX_TIMEOUT_MS`, default 10 s), stdout/stderr
caps (64 KiB), a **cleared environment** (only `LANG`, `HOME` and `TMPDIR` are set), and a throw-away working
directory under `/tmp/jmq-work` that is deleted afterwards. At most `RUNNER_MAX_CONCURRENT` (2) runs at a time.
When a run times out or floods its output, the child JVM **and every process it started** are killed.

**Container** (`compose.yaml`, service `runner`):

- non-root user `10001`, `cap_drop: [ALL]`, `no-new-privileges`
- `read_only: true` root filesystem; the only writable path is a 128 MB `tmpfs` on `/tmp`
  mounted `noexec,nosuid,nodev` (class files are *loaded* by the JVM, never executed, so `noexec` is fine)
- `pids_limit: 256` (JVM threads count — stops fork/thread bombs), `mem_limit: 1g`, `cpus: 1.5`
- network `runner-net` is `internal`: **no internet access**, no route to the database, no published port
- no volumes, no Docker socket, no database credentials in its environment, no `JAVA_TOOL_OPTIONS`
- `init: true` plus the runner's **orphan reaper** (`RUNNER_REAP_ORPHANS=true`, `OrphanReaper.java`): learner
  code may start subprocesses (`/bin/sh` exists in the image); anything still alive after its run is
  re-parented to the container's init and is killed after each run and every 2 s, so leftovers cannot eat
  the `pids_limit` budget. The reaper refuses to run unless PID 1 is a container init.

**Honest limits — know what this is and isn't:**

- It is **one long-lived container for all runs**, not a fresh container per run. All runs share the same
  kernel, user (uid 10001) and `/tmp`. While two runs overlap, one could read the other's working directory,
  and learner code can read the runner process's environment via `/proc` (including `RUNNER_TOKEN`).
- Learner code shares the container's network namespace: it can open connections to the runner's own port
  and to **`web:3000`**, i.e. it can call the app's HTTP API. It cannot reach the internet or PostgreSQL.
- Learner code can start programs that exist in the image (`/bin/sh`, coreutils) as uid 10001 — but nothing
  it writes itself can be executed (`/tmp` is `noexec`, the rest is read-only), and leftovers are reaped.
- Only Docker's **default seccomp profile** and default AppArmor/SELinux policy apply; there is no custom
  seccomp profile, no gVisor/Kata/Firecracker. A Linux kernel exploit would escape the container.
- A runaway program can use the container's shared memory/pids/CPU budget until its timeout fires; that can
  slow down or fail a concurrent run, but not the host or the other services.
- The design goal is "safe enough to run **your own** learning code on your own machine", not
  "safe to run arbitrary code from strangers". Do not expose the app or the runner to other people.
- **Native mode** (`runner/run-local.sh`, `scripts/dev-native.sh`) has none of the container protections:
  learner code runs as your OS user (still in a child JVM with the limits above). It binds to 127.0.0.1 only.
  The orphan reaper is off there, so a subprocess started by a run that *finishes normally* keeps running
  until you stop it.
  It refuses requests that come from a browser (any `Origin`/`Sec-Fetch-Site` header → 403, non-JSON body →
  415), so a web page you visit cannot use it, and `dev-native.sh` gives web and runner a random shared
  `RUNNER_TOKEN` (D-020).

## 4. Data persistence

All learner data (progress, attempts, reviews, notes, exam history) lives in PostgreSQL, in the named Docker
volume **`jmq-pgdata`**.

| Command                         | Containers | Data |
|---------------------------------|------------|------|
| `docker compose stop`           | stopped    | kept |
| `docker compose down`           | removed    | **kept** (volume survives) |
| `docker compose up --build`     | rebuilt    | kept |
| `docker compose down -v`        | removed    | **DELETED — the volume is removed, progress is gone** |
| `docker volume rm jmq-pgdata`   | –          | **DELETED** |

**Never use `down -v` unless you mean to wipe everything.** Take a backup first (§5).

## 5. Backup and restore

```sh
scripts/backup.sh                     # → backups/jmq-YYYYmmdd-HHMMSS.dump  (pg_dump custom format)
scripts/backup.sh /path/to/elsewhere  # other output directory
```

The dump runs inside the `db` container (no host PostgreSQL tools needed), is verified with
`pg_restore --list`, and is written with private permissions. `backups/*.dump` is git-ignored — copy
important backups off the machine.

```sh
scripts/restore.sh backups/jmq-20261013-101500.dump        # asks you to type "restore"
scripts/restore.sh --yes backups/jmq-20261013-101500.dump  # no prompt (scripts/automation)
```

`restore.sh`: verifies the archive → asks for confirmation → takes a **safety backup** of the current
database → stops `web` → replaces the database in **one transaction** (`DROP SCHEMA public CASCADE` +
`pg_restore --clean --if-exists`; a corrupt archive or any SQL error rolls back and leaves the current data
untouched) → runs the `migrate` job (upgrades an older backup to the current schema and re-seeds content)
→ starts `web` again if it was running.

## 6. Logs

```sh
docker compose logs -f web            # app + API
docker compose logs -f runner         # compile/run service
docker compose logs migrate           # last migration/seed run
docker compose logs -f                # everything
```

Logs use the `json-file` driver, rotated at 10 MB × 3 files per service.

## 7. Stop, restart, upgrade

```sh
docker compose stop                   # stop everything, keep containers and data
docker compose start                  # start again
docker compose down                   # remove containers + networks, keep data
docker compose restart web            # restart only the app
docker compose up -d --build          # rebuild after pulling new code; data is kept, migrations run
```

Restarting or rebuilding never loses progress as long as the `jmq-pgdata` volume is kept. Before pulling a
version that contains new migrations, take a backup (`scripts/backup.sh`).

## 8. Updating content

Content (`content/`) is baked into the `migrate` and `web` images, so rebuild them and re-run the seed:

```sh
docker compose build migrate web
docker compose run --rm migrate       # migrations + idempotent content upsert
docker compose up -d web              # web also reads content/readiness.yaml at runtime
```

(`docker compose up -d --build` does all three.) Seeding never deletes learner history; content removed from
`content/` is marked `retired`.

## 9. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `Bind for 127.0.0.1:3000 failed: port is already allocated` | Another process uses the port. Set `WEB_PORT=3001` in `.env`, then `docker compose up -d`. |
| `web` never starts; `migrate` shows `exited (1)` | `docker compose logs migrate`. *Checksum mismatch*: an already-applied migration file was edited — restore the file and add a new `NNN_*.sql` instead. *content has N errors*: fix the listed files (`cd web && npm run content:validate`). *password authentication failed*: see next row. |
| `password authentication failed for user "jmq"` | `POSTGRES_*` values are only applied when the volume is first created. Either put the original password back in `.env`, or change it in the database: `docker compose exec db psql -U jmq -d jmq -c "ALTER USER jmq PASSWORD 'new-value'"` and update `.env`. |
| "The Java runner is not reachable" / Run buttons fail | The runner is optional: everything else (lessons, practice, exams, progress) keeps working. Check `docker compose ps runner` and `docker compose logs runner`; restart with `docker compose up -d runner`. If Run reports `unauthorized`, `web` and `runner` disagree on `RUNNER_TOKEN` (both read it from `.env`; recreate both with `docker compose up -d`). |
| App shows "The database is not reachable" / `/api/health` returns 503 | `docker compose ps db` and `docker compose logs db`. Wait for `db` to be healthy, then `docker compose restart web`. |
| Runner image build fails in `test.sh` (timeouts) on a slow or emulated (e.g. cross-arch) machine | The image build runs the runner's self-test, which includes timing assertions. Build without it: `docker compose build --build-arg RUN_TESTS=false runner`. |
| Changes to `.env` have no effect | Containers must be recreated: `docker compose up -d` (not `restart`). |

### Host names (DNS-rebinding protection)

The app answers only requests addressed to `localhost`, `127.0.0.1` or `[::1]` (HTTP 421 otherwise), because
it has no login. To reach it under another name, e.g. through an SSH tunnel with a custom host or a LAN name,
add the name to `ALLOWED_HOSTS` in `.env` (comma-separated) and `docker compose up -d web`.

## 10. Development without Docker

```sh
scripts/dev-native.sh         # runner (background) + migrate + seed + next dev on http://127.0.0.1:3000
runner/run-local.sh           # just the runner, on 127.0.0.1:8090
```

`dev-native.sh` checks its prerequisites (Node 22+, JDK 25 via `runner/jdk.sh`, `DATABASE_URL` from the
environment or `web/.env.local`), builds the runner if needed, starts it and points the app at it, runs
migrations + seed, then `next dev`. Ctrl-C stops both. Options: `RUNNER_PORT`, `WEB_PORT`, `SKIP_RUNNER=1`.

## 11. Verification status

**Executed on 2026-10-13** in the build environment (Docker Engine 29.8.2, Compose v5.5.1, BuildKit,
overlayfs, cgroup v1), with the command from §1 (`docker compose up --build -d`, generated `.env`,
`WEB_PORT=3400` because 3000 was busy):

| Check | Result |
|---|---|
| Image builds (`web` runtime, `web-tools`, `runner`) | built; `npm ci` + `next build` inside the image; `runner/test.sh` inside the build: **41/41** |
| Startup order | `db` healthy → `migrate` exit 0 (3 migrations, 32 lessons / 384 questions / 17 exercises seeded) → `web` and `runner` healthy |
| `scripts/smoke-test.sh` | all checks passed (health reports db + runner ok) |
| Browser journey (`tests/e2e`, Playwright against the containers, fresh volume) | **9/9**, then `docker compose down` + `up -d` (every container recreated, migrate re-ran) → persistence test **1/1**; repeated twice more on fresh volumes: 9/9 + 1/1 each time |
| Coding Lab through `web → runner` | **17/17** reference solutions pass, all 17 starters fail (file I/O exercises work on the read-only FS via `/tmp`) |
| Runner isolation, probed from learner code | uid/gid 10001, `CapEff 0`, `NoNewPrivs 1`, seccomp filter on; writes to `/`, `/app`, `/etc/passwd` refused; `/tmp` writable; executing a file written to `/tmp` → permission denied; DNS and TCP to the internet → unreachable; `db` → unresolvable; `web:3000` → reachable (documented in §3) |
| Runner resource limits | infinite loop stopped at 5 s; OOM contained; output flood truncated and killed; thread bomb stopped at ~220 threads by `pids_limit`; 16 runs spawning 300+ orphan processes → none left (reaper), runner still healthy |
| Hardening as configured | `docker inspect`: runner read-only rootfs, `cap_drop ALL`, `no-new-privileges`, pids 256, 1 GiB, 1.5 CPU, only on `runner-net` (`internal: true`); web runs as `node` with `cap_drop ALL`; port published on `127.0.0.1` only; db and runner unpublished |
| `scripts/backup.sh` → damage → `scripts/restore.sh --yes` | data back exactly (30 attempts, 562 XP, 13 mistakes, 1 exam); safety backup written; non-interactive run without `--yes` refused; junk file rejected |
| `docker compose stop` / `start` | PostgreSQL shutdown checkpoint completed; everything healthy again |

**The caveat — base images.** Every container registry was blocked from the build machine, so the three
base images could not be pulled. They were replaced by local stand-ins, built from an Ubuntu 24.04 root
filesystem (debootstrap from archive.ubuntu.com) to mirror the official Dockerfiles:

| Tag used by this repo | Stand-in | Differences from the official image |
|---|---|---|
| `eclipse-temurin:25-jdk-noble` | Ubuntu 24.04 + the same packages, layout, env and entrypoint as adoptium/containers | Temurin 25.0.4+7 instead of the image's current 25.0.4.1+1 |
| `node:22-bookworm-slim` | user `node` 1000:1000, `/usr/local` layout and entrypoint as nodejs/docker-node | Ubuntu 24.04 instead of Debian 12; Node 22.22.0 instead of 22.23.3; trusts the build machine's TLS proxy CA so `npm ci` could reach the registry |
| `postgres:17-bookworm` | PostgreSQL **17.11** compiled from the upstream tag; users, gosu, locale, `PGDATA`, and the docker-library entrypoint scripts verbatim | Ubuntu 24.04 instead of Debian 12; built from source instead of the PGDG package |

So what is proven is this repository's Dockerfiles, Compose file, scripts and isolation settings, on images
that match the official ones in every way those files depend on. Not proven: the exact bytes of the
official images. If your first build fails on a base-image detail, that is where to look.

Also run natively in the same environment (see `docs/IMPLEMENTATION_PLAN.md`): unit/integration tests,
content validation and JDK 25 verification, the same E2E journey against a production build with a native
PostgreSQL restart, and ShellCheck on all scripts.

Quick self-check on your machine after the first start:

```bash
./scripts/smoke-test.sh
docker compose exec runner sh -c 'id; touch /x'            # uid=10001 …, "Read-only file system"
docker compose ps                                          # db, web, runner: (healthy); migrate: Exited (0)
```
