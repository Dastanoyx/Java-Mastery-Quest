---
id: pkg-compile-package-run
domain: D7
order: 2
title: Compiling, Packaging & Running — JARs, jlink, Migration and Compact Source Files
summary: The command-line half of D7 — javac and java on the class path and the module path, plain and modular JARs, jdeps and jlink runtime images, unnamed and automatic modules for migration, the source-file launcher with multi-file programs, and Java 25's compact source files with instance main methods.
minutes: 60
objectives: [D7.2]
prerequisites: [pkg-modules-services]
contract:
  - Write the javac, jar and java commands that compile, package and launch an application on the class path and on the module path.
  - Explain what the manifest attributes Main-Class, Class-Path and Automatic-Module-Name do, and how `java -jar` builds its class path.
  - Use jdeps to find dependencies and internal-API usage, and jlink to build a custom runtime image with a launcher.
  - Classify code as named, automatic or unnamed module, derive an automatic module's name, and plan a bottom-up or top-down migration.
  - Launch single-file and multi-file source programs (JEP 458) and predict which classes get compiled.
  - Write compact source files with instance main methods (JEP 512) and predict which main method the launch protocol selects.
keyRules:
  - "Compile modules: `javac -d out --module-source-path src -m com.app` (multi-module) or `javac -p mods -d out/com.app $(find src/com.app -name '*.java')`. Run: `java -p out -m com.app/com.app.Main`."
  - "`java -jar app.jar`: Main-Class from the manifest; class path = the JAR + its Class-Path entries (relative to the JAR); -cp is ignored."
  - "Modular JAR on the module path → named module; on the class path → unnamed module (module-info ignored). Plain JAR on the module path → automatic module; on the class path → unnamed module."
  - "Automatic module: name from Automatic-Module-Name or the file name; exports and opens all packages; reads all modules including the unnamed module."
  - "Named modules cannot read the unnamed module (class path). The unnamed module reads every module."
  - "jlink links explicit modules only (no automatic modules) and adds service providers only via --add-modules or --bind-services."
  - "`java Prog.java` compiles in memory, runs the first top-level class, and (since Java 22, JEP 458) compiles other source files from the same directory tree on demand."
  - "Compact source file (Java 25, JEP 512): implicit final class named after the file, unnamed package, implicit `import module java.base;`, no constructors/initializers/package; must declare a main method."
  - "Launch protocol: non-private main(String[]) (declared or inherited) first, else non-private main(); instance main needs a non-private no-arg constructor."
  - "`java.lang.IO`: print, println, readln(), readln(prompt) — not statically imported; write `IO.println`."
retrieval:
  - Write the commands to compile two modules from src/ into out/ and run the main class as a module.
  - Fill in the 2×2 table of (modular JAR, plain JAR) × (module path, class path) with the kind of module each becomes.
  - Derive the automatic module names of `json-utils-2.4.jar` and `my_lib.core-1.0-SNAPSHOT.jar`.
  - Name three jdeps options and three jlink options and what they do.
  - State the Java 25 launch protocol in four steps.
  - List four things a compact source file cannot contain.
checks: [D7-PKG-012, D7-PKG-010, D7-PKG-007, D7-PKG-013, D7-PKG-011, D7-PKG-001, D7-PKG-002, D7-PKG-005]
mastery: [D7-PKG-003, D7-PKG-004, D7-PKG-006, D7-PKG-008, D7-PKG-009]
---

## Mental model: two paths, three kinds of modules

Every class the JVM loads comes from one of two places, and that place decides its module:

- The **class path** (`-cp`, `-classpath`, `--class-path`, or `CLASSPATH`): everything here belongs to the one
  **unnamed module**. It reads every module and exports all its packages, but has no name, so no named module
  can `require` it.
- The **module path** (`-p`, `--module-path`): every JAR or exploded directory here is a module. With a
  `module-info.class` it is a **named (explicit)** module; without one it becomes an **automatic** module.

| | on the module path | on the class path |
|---|---|---|
| **modular JAR** (has `module-info.class`) | named module — encapsulation enforced | unnamed module — `module-info` ignored |
| **plain JAR** | automatic module | unnamed module |

Almost every command in this lesson is about choosing the right path for each artefact.

## javac and java: class path versus module path

**Class path (non-modular) build**

```bash
javac -d out -cp lib/json.jar src/com/acme/*.java src/com/acme/util/*.java   # -d: output root, package dirs created
java  -cp out:lib/json.jar com.acme.Cli arg1 arg2                            # ':' on Linux/macOS, ';' on Windows
```

**Module build.** For several modules, use *multi-module mode*: sources live in `src/<module-name>/...`, and
javac writes `out/<module-name>/...`.

```bash
# src/com.app/module-info.java, src/com.app/com/app/Main.java, src/com.util/...
javac -d out --module-source-path src -m com.app            # also compiles com.util, which com.app requires
java  -p out -m com.app/com.app.Main                         # --module-path / --module

# single-module mode against precompiled modules
javac -p mods -d out/com.app src/com.app/module-info.java src/com.app/com/app/Main.java
```

Useful launcher options (they must come **before** `-m`/the main class — anything after it is program
arguments):

| Option | Purpose |
|---|---|
| `--list-modules` | modules of the runtime image |
| `-d` / `--describe-module com.app` | print a module's descriptor (`-p` needed for app modules) |
| `--show-module-resolution` | trace resolution, including `binds` for services |
| `--add-modules m1,m2` | add root modules (e.g. a `requires static` dependency, or modules used from the class path) |
| `--add-exports m/p=target`, `--add-opens m/p=target`, `--add-reads m=target` | patch encapsulation from the command line; `target` may be `ALL-UNNAMED` |

> [!TRAP]
> `java -p out com.app.Main` (no `-m`) does not launch a module: the class name is looked up on the class path.
> And `java -m com.app.Main -p out` fails because `-m` needs `module/class` (or a module whose JAR records a
> main class), and `-p out` would be passed to `main` as arguments.

::check D7-PKG-012

## JARs and manifests

```bash
jar --create --file app.jar --main-class com.acme.Cli -C out .   # short: jar cfe app.jar com.acme.Cli -C out .
jar --create --file app.jar --manifest MANIFEST.txt -C out .     # short: jar cfm app.jar MANIFEST.txt -C out .
jar --list --file app.jar                                        # short: jar tf app.jar
jar --extract --file app.jar                                     # short: jar xf app.jar
jar --describe-module --file app.jar                             # short: jar -d -f app.jar
```

`-C dir .` means "change to `dir` and add everything", so the JAR root holds the package directories. The
manifest (`META-INF/MANIFEST.MF`) is a list of `Name: value` lines:

```text
Manifest-Version: 1.0
Main-Class: com.acme.Cli
Class-Path: lib/json.jar lib/log.jar
Automatic-Module-Name: com.acme.cli
```

- `Main-Class` makes the JAR executable with `java -jar app.jar`.
- `Class-Path` lists **space-separated relative URLs, resolved against the JAR's own directory**.
- `Automatic-Module-Name` fixes the module name the JAR gets when used as an automatic module.
- A manifest file passed with `--manifest` must end with a newline, or its last line is ignored.

> [!RULE]
> With `java -jar app.jar`, the JAR is the entire user class path (plus its `Class-Path` entries). Any `-cp`
> option or `CLASSPATH` variable is **ignored**.

A **modular JAR** is just a JAR with `module-info.class` at its root. `jar --create --file mods/com.app.jar
--main-class com.app.Main -C out/com.app .` records the main class in the module descriptor, so
`java -p mods -m com.app` is enough.

::check D7-PKG-010

## jdeps and jlink

**jdeps** statically analyses class files and JARs — it never runs or modifies them:

| Command | Output |
|---|---|
| `jdeps app.jar` | package-level dependencies per module |
| `jdeps -s app.jar` (`--summary`) | one line per module dependency, e.g. `app.jar -> java.sql` |
| `jdeps --list-deps app.jar` / `--print-module-deps` | the JDK modules needed (the latter comma-separated, ready for jlink) |
| `jdeps --jdk-internals app.jar` | uses of JDK-internal APIs such as `sun.misc.Unsafe`, with suggested replacements |
| `jdeps --generate-module-info dir app.jar` | writes a draft `module-info.java` into `dir` |

**jlink** links a set of modules and their transitive `requires` into a **custom runtime image** — a trimmed
JDK containing only what the application needs:

```bash
jlink --module-path mods --add-modules com.app \
      --output image --launcher app=com.app/com.app.Main \
      --strip-debug --no-header-files --no-man-pages
image/bin/app                    # generated launcher script
image/bin/java --list-modules    # com.app, its dependencies, java.base ... nothing else
```

JDK modules are found automatically; your own go on `--module-path`.

> [!TRAP]
> jlink resolves only `requires` edges from the roots. It does **not** bind services the way `java` does at
> start-up: a provider module that nobody requires is missing from the image unless you add it with
> `--add-modules` or pass `--bind-services`. And jlink refuses automatic modules
> (*automatic module cannot be used with jlink*) — every linked module must have a real `module-info`.

## Migration: unnamed, automatic and named modules

An **automatic module** is the bridge between the two worlds. It:

- gets a name: `Automatic-Module-Name` from the manifest, else derived from the file name — drop `.jar`, drop a
  trailing version (`-` followed by a digit, e.g. `-2.1.0-SNAPSHOT`), replace every non-alphanumeric character
  with `.`, collapse repeated dots, trim leading/trailing dots;
- **exports and opens every package**;
- **reads every other module, including the unnamed module**, and grants implied readability to all other
  automatic modules.

| File name | Automatic module name |
|---|---|
| `commons-lang3-3.14.0.jar` | `commons.lang3` |
| `acme-utils_core-2.1.0-SNAPSHOT.jar` | `acme.utils.core` |
| `hello-world.jar` | `hello.world` |
| `2fast.jar`, `lib-abstract-1.0.jar` | none — `2fast` and `abstract` are not legal identifiers, so the JAR cannot be an automatic module |

::check D7-PKG-007

Two migration strategies for an application `app → biz → util`:

- **Bottom-up:** modularise the leaves first. `util` gets a `module-info` and moves to the module path; `biz`
  and `app` stay on the class path, where the unnamed module can read `util`. Then `biz`, then `app`. Works
  when you own every JAR.
- **Top-down:** move **all** JARs to the module path at once — unconverted ones become automatic modules — then
  give `app` a `module-info` that `requires` them by their automatic names, and continue downward. The usual
  choice when third-party libraries are not modular yet.

> [!TRAP]
> A named module can never depend on the class path: there is no `requires` for the unnamed module (and
> `ALL-UNNAMED` is only a value for command-line options such as `--add-reads`). If `app` is named, everything it
> uses must be on the module path — as named or automatic modules.

::check D7-PKG-013

## Launching source files: single-file and multi-file programs

`java Prog.java args…` runs in **source-file mode** (Java 11, JEP 330): the file is compiled in memory — no
`.class` files are written — and the **first top-level class** in the file is launched. Since **Java 22
(JEP 458)** a program may span several files: when the launched code references a class that is not in the
file, the launcher looks for its source in the directory tree rooted at the launched file's directory
(packages map to subdirectories) and compiles it **on demand**.

```text
project/
  Prog.java          class Prog { public static void main(String[] a) { System.out.println(Helper.hi() + util.Text.up("x")); } }
  Helper.java        class Helper { static String hi() { return "hi"; } }
  util/Text.java     package util; public class Text { public static String up(String s) { return s.toUpperCase(); } }
  Broken.java        class Broken { int x = ; }      ← never referenced, so never compiled
```

`java Prog.java` prints `hiX`. Libraries in JARs are added as usual with `-cp`. A file without the `.java`
suffix (for example a script with a `#!` line) needs `--source 25`.

> [!NOTE]
> Put the class with `main` first in the file. In JDK 25, if the first top-level class has no main method,
> the source launcher falls back to a top-level class named after the file; if there is none, it reports
> *can't find class*.

::check D7-PKG-011

## Java 25: compact source files and instance main methods (JEP 512)

> [!J25]
> Final in Java 25 (JEP 512; previewed in Java 21–24 as "unnamed classes" / "implicitly declared classes").
> Two independent features: **instance main methods** for every class, and **compact source files** whose
> fields and methods are not inside a class declaration.

A compact source file contains imports, then fields, methods and member type declarations. The compiler wraps
them in an **implicitly declared class** that is `final`, extends `Object`, lives in the unnamed package, and is
named after the file — but cannot be named in source code (no other class can write `new Main()` or refer to
`Main`). Every compact source file implicitly has `import module java.base;`.

```java predict
String name = "modules";
int calls;

void main() {
    calls++;
    IO.println(getClass().getName() + " " + calls + " " + name.length());
    IO.println(Modifier.isFinal(getClass().getModifiers()) + " " + getClass().getSuperclass().getSimpleName());
}
```
```output
Main 1 7
true Object
```

(This file is `Main.java`; `Modifier` comes from `java.lang.reflect`, imported through the implicit
`import module java.base`.)

What a compact source file **cannot** contain: a `package` declaration (*compact source file should not have
package declaration*), constructors (there is no class name to write — `Tool() { }` parses as a method without
a return type), static or instance initializer blocks, and it must declare a launchable `main` (*compact
source file does not have main method in the form of void main() or void main(String[] args)*). Records,
classes and interfaces declared in the file become **member** types of the implicit class.

**`java.lang.IO`** is the beginner-friendly console class: `IO.print(Object)`, `IO.println(Object)`,
`IO.println()`, `IO.readln()` and `IO.readln(String prompt)` (prints the prompt without a newline, then reads a
line; `null` at end of input). It throws no checked exceptions. Its methods are **not** statically imported:
write `IO.println(...)` (or add `import static java.lang.IO.*;`).

> [!TRAP]
> Tutorials based on the previews show a bare `println("Hi")` inside a compact file. In final Java 25 that is
> *cannot find symbol* — the automatic static import was dropped and `IO` moved from `java.io` to `java.lang`.

::check D7-PKG-001

::check D7-PKG-002

::check D7-PKG-005

**The launch protocol** applies to every launched class, compact or not:

1. If the class declares **or inherits** a non-private `main(String[])` — static or instance — choose it.
2. Otherwise, if it declares or inherits a non-private `main()` with no parameters, choose it.
3. If the chosen method is `static`, invoke it.
4. Otherwise instantiate the class with its **non-private no-arg constructor** (failing with *no non-private
   zero argument constructor found* if there is none), then invoke the method on the new instance.

`private` methods named `main` are never candidates; `public`, `protected` and package access all work.

```java predict
public class Main {
    static void main() {
        System.out.println("static main()");
    }

    void main(String[] args) {
        System.out.println("instance main(String[])");
    }
}
```
```output
instance main(String[])
```

The `String[]` form wins even though it is an instance method and the other one is static. For instance mains
the object is fully constructed first:

```java predict
public class Main {
    private final String greeting;

    Main() {
        greeting = "constructed";
        System.out.println("constructor");
    }

    void main() {
        System.out.println("main sees " + greeting);
    }
}
```
```output
constructor
main sees constructed
```

## Exam checklist

- `-cp` → unnamed module; `-p … -m module/class` → named/automatic modules. Launcher options before `-m`.
- `jar --create --file x.jar --main-class C -C dir .`; `java -jar` ignores `-cp`; `Class-Path` is relative to
  the JAR.
- Automatic module = name from manifest or file name, exports/opens everything, reads everything (including the
  class path). Named modules cannot read the class path.
- jdeps analyses (`--list-deps`, `--jdk-internals`, `-s`); jlink builds images (`--module-path`,
  `--add-modules`, `--output`, `--launcher`), explicit modules only, no automatic service binding.
- `java Prog.java`: in-memory, first top-level class, other files compiled on demand (Java 22+).
- Compact source file: implicit final class named after the file, implicit `import module java.base`, no
  package/constructors/initializers, needs `main`; use `IO.println`.
- Launch protocol: `main(String[])` (declared or inherited) before `main()`; instance main needs a non-private
  no-arg constructor; `private` main is invisible.
