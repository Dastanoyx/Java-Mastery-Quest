package dev.jmq.runner;

import java.nio.file.Path;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

/**
 * Kills processes that learner code left behind.
 *
 * <p>Learner code can start subprocesses (for example {@code /bin/sh -c "sleep 300 &"}). When its JVM exits,
 * those processes are re-parented to the container's init (PID 1) and would keep running, eating the
 * container's {@code pids_limit} budget until the runner can no longer start JVMs. In the container every
 * legitimate process is either this runner, a child JVM it is waiting for, or something started by
 * {@code docker exec} (health checks), whose parent is outside the container's PID namespace. So any other
 * direct child of the orphan parent is a leftover and is killed together with its descendants.
 *
 * <p>Opt-in ({@code RUNNER_REAP_ORPHANS=true}, set only by the container image) and refused unless PID 1 is
 * a container init or the runner itself: on a normal machine PID 1's children are the user's own programs.
 */
final class OrphanReaper {
    private static final Logger LOG = Logger.getLogger(OrphanReaper.class.getName());
    private static final Set<String> CONTAINER_INITS = Set.of("docker-init", "tini", "catatonit", "dumb-init");

    private final long self;
    private final long orphanParent;
    private final Set<Long> active;
    private final Object lock;

    private OrphanReaper(long self, Set<Long> active, Object lock) {
        this.self = self;
        // With an init process (compose `init: true`) orphans go to PID 1; if the runner *is* PID 1 they come to us.
        this.orphanParent = self == 1 ? self : 1;
        this.active = active;
        this.lock = lock;
    }

    /** Pure decision rule (unit-tested): is {@code pid} (whose parent is {@code ppid}) a leftover to kill? */
    static boolean isLeftover(long pid, long ppid, long self, long orphanParent, Set<Long> active) {
        return pid != self && pid != 1 && ppid == orphanParent && !active.contains(pid);
    }

    /** Returns a started reaper, or null when disabled or when the environment is not a container. */
    static OrphanReaper startIfEnabled(JavaSandbox sandbox) {
        if (!"true".equalsIgnoreCase(System.getenv("RUNNER_REAP_ORPHANS"))) return null;
        long self = ProcessHandle.current().pid();
        if (self != 1) {
            String init = ProcessHandle.of(1).flatMap(p -> p.info().command())
                    .map(c -> Path.of(c).getFileName().toString()).orElse("");
            long parent = ProcessHandle.current().parent().map(ProcessHandle::pid).orElse(-1L);
            if (!CONTAINER_INITS.contains(init) || parent != 1) {
                LOG.warning("RUNNER_REAP_ORPHANS ignored: PID 1 ('" + init + "') is not a container init we are a child of");
                return null;
            }
        }
        var reaper = new OrphanReaper(self, sandbox.activeChildren(), sandbox.processLock());
        sandbox.afterRun(reaper::sweep);
        var timer = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon().name("orphan-reaper").factory());
        timer.scheduleWithFixedDelay(reaper::sweep, 2, 2, TimeUnit.SECONDS);
        LOG.info("Orphan reaper enabled (orphan parent PID " + reaper.orphanParent + ")");
        return reaper;
    }

    /** Kills every leftover process tree; repeats while it finds some (grandchildren re-parent as parents die). */
    int sweep() {
        int killed = 0;
        try {
            for (int round = 0; round < 5; round++) {
                int n = 0;
                synchronized (lock) {
                    for (ProcessHandle ph : ProcessHandle.allProcesses().toList()) {
                        Optional<ProcessHandle> parent = ph.parent();
                        if (parent.isEmpty() || !isLeftover(ph.pid(), parent.get().pid(), self, orphanParent, active)) continue;
                        ph.descendants().forEach(ProcessHandle::destroyForcibly);
                        ph.destroyForcibly();
                        n++;
                    }
                }
                killed += n;
                if (n == 0) break;
                Thread.sleep(50);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            LOG.warning("Orphan sweep failed: " + e);
        }
        if (killed > 0) {
            int k = killed;
            LOG.info(() -> "Killed " + k + " leftover process(es) started by learner code");
        }
        return killed;
    }
}
