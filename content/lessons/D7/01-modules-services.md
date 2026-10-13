---
id: pkg-modules-services
domain: D7
order: 1
title: Modules, Reflection, Services & Module Imports
summary: The Java Platform Module System from the inside — module-info directives, readability versus accessibility, deep reflection with opens, services with uses/provides and ServiceLoader, split packages and cycles, and Java 25's module import declarations.
minutes: 60
objectives: [D7.1]
prerequisites: []
contract:
  - Write a module declaration using requires, requires transitive, requires static, exports, exports…to, opens, opens…to, uses and provides…with, and state what each directive grants at compile time and at run time.
  - Decide whether code in one module can name, call or reflect on a type in another module by checking readability, export/open status and the type's access modifier.
  - Predict when reflective access succeeds, when it throws InaccessibleObjectException and when IllegalAccessException.
  - Build a service consumer and provider (constructor or static provider() method) and predict what ServiceLoader finds — including the errors when uses is missing or a provider is invalid.
  - Use Java 25 module import declarations (JEP 511) and resolve the ambiguities they can create with single-type and on-demand imports.
keyRules:
  - "Accessibility across modules = public type + package exported to the using module + the using module reads the declaring module."
  - "`requires transitive M`: every module that reads me also reads M (implied readability). `requires static M`: required at compile time, optional at run time."
  - "`exports p` = compile-time and run-time access to public members of p. `opens p` = run-time deep reflection on all members of p, no compile-time access. `open module` opens every package and may not contain `opens`."
  - "`setAccessible(true)` on a member of another named module throws InaccessibleObjectException unless the package is opened to the caller's module."
  - "A consumer declares `uses S`; a provider declares `provides S with C`. ServiceLoader prefers a public static no-arg `provider()` method, otherwise needs a public no-arg constructor of a class implementing S. Provider packages need not be exported."
  - "Without `uses S`, `ServiceLoader.load(S.class)` in a named module throws ServiceConfigurationError."
  - "A module may not read the same package from two modules (split package), and the requires graph may not contain cycles."
  - "`import module M;` (final in Java 25, JEP 511) imports all public top-level types of packages M exports to you, plus those of modules M requires transitively. Single-type imports shadow on-demand imports, which shadow module imports."
retrieval:
  - List the nine kinds of module directives and say, for each, whether it acts at compile time, run time or both.
  - Write the three conditions for code in module A to access a type in module B.
  - Explain the difference between `exports p to m`, `opens p to m` and `open module` in one sentence each.
  - "Describe the two ways a class can be a service provider and which one ServiceLoader tries first."
  - "Why does `import module java.base; import module java.sql;` make `Date` ambiguous, and what single line fixes it?"
checks: [D7-MOD-001, D7-MOD-002, D7-MOD-005, D7-MOD-006, D7-MOD-008, D7-MOD-010, D7-MOD-011, D7-MOD-013, D7-MOD-014, D7-MOD-015]
mastery: [D7-MOD-003, D7-MOD-004, D7-MOD-007, D7-MOD-009, D7-MOD-012, D7-MOD-016, D7-MOD-017]
---

## Mental model: a module is a package set with a contract

Before Java 9 the unit of encapsulation stopped at the package: anything `public` was usable by any class on
the class path, and the JVM resolved classes by searching a flat list of JARs. A **module** adds a layer
above packages. It is a named set of packages plus a descriptor, `module-info.java`, that states two kinds of
facts:

- **What I need** — which other modules this module *reads* (`requires`).
- **What I offer** — which of my packages others may *access* (`exports`) or *reflect on* (`opens`), and
  which services I *use* or *provide*.

Everything else is strongly encapsulated, even `public` classes. At start-up the module system builds a
**module graph** (resolution) from the root module, and from then on the compiler and the JVM enforce two
separate ideas:

| Concept | Question it answers | Declared by |
|---|---|---|
| **Readability** | Does module A know about module B at all? | `requires` (+ `transitive`), automatic rules |
| **Accessibility** | May code in A use type `T` of B? | `public` on T **and** `exports` of T's package to A **and** A reads B |

You can inspect modules at run time through `java.lang.Module`. A class loaded from the class path lives in
the **unnamed module**:

```java predict
import java.lang.reflect.*;

public class Main {
    private int secret = 7;

    public static void main(String[] args) throws Exception {
        Module mine = Main.class.getModule();
        Module base = String.class.getModule();
        System.out.println(mine.isNamed() + " " + mine.getName());
        System.out.println(base + " " + base.getDescriptor().isOpen());
        System.out.println(base.isExported("java.util") + " " + base.isExported("jdk.internal.misc"));
        System.out.println(mine.canRead(base) + " " + base.canRead(mine));

        Field own = Main.class.getDeclaredField("secret");
        own.setAccessible(true);
        System.out.println("own private field: " + own.getInt(new Main()));

        Field value = String.class.getDeclaredField("value");
        System.out.println("trySetAccessible: " + value.trySetAccessible());
        try {
            value.setAccessible(true);
        } catch (InaccessibleObjectException e) {
            System.out.println("blocked by " + e.getClass().getSimpleName());
        }
    }
}
```
```output
false null
module java.base false
true false
true false
own private field: 7
trySetAccessible: false
blocked by InaccessibleObjectException
```

Read it line by line: the unnamed module has no name; `java.base` is a normal (not open) module that exports
`java.util` but not its internal packages; the unnamed module reads every module, but `java.base` does not
read the unnamed module. Deep reflection inside your own module works, but `java.base` does not open
`java.lang`, so even a class-path program cannot break into `String`'s private field any more.

## Anatomy of module-info.java

The descriptor lives at the **root** of the module's source tree (`src/com.shop/module-info.java`) and
compiles to `module-info.class` at the root of the module's output or JAR.

```java
import com.shop.spi.PaymentGateway;          // imports are allowed in module-info

@Deprecated(since = "3")                     // annotations too
module com.shop {                            // name: dotted identifiers, conventionally reverse-DNS
    requires java.sql;                       // read java.sql
    requires transitive com.money;           // read com.money, and so does everyone who reads com.shop
    requires static com.shop.annotations;    // needed to compile, optional at run time

    exports com.shop.api;                    // public types usable by every module that reads com.shop
    exports com.shop.admin to com.backoffice, com.audit;   // qualified export

    opens com.shop.entity to org.hibernate.orm;            // deep reflection at run time only

    uses PaymentGateway;                                   // this module calls ServiceLoader for it
    provides com.money.spi.Converter with com.shop.fx.EcbConverter;
}
```

| Directive | Compile time | Run time |
|---|---|---|
| `requires M` | may use M's exported types | M must be present; this module reads M |
| `requires transitive M` | same, and readers of this module may use M's types | implied readability for readers |
| `requires static M` | same as `requires` | M is read **only if** something else resolved it |
| `exports p` / `exports p to M…` | public types of p accessible (to all / to the listed modules) | same, also for reflection on public members |
| `opens p` / `opens p to M…` | nothing | all members of p reflectively accessible, incl. private (`setAccessible`) |
| `uses S` | S must be accessible | allows `ServiceLoader.load(S.class)`; triggers service binding |
| `provides S with C…` | C validated (see services) | registers C as a provider of S |

> [!RULE]
> `java.base` is read by every module implicitly (`requires java.base` is legal but redundant). Each package
> may appear in at most one `exports` and at most one `opens` directive — `exports p; exports p to m;` is a
> *duplicate or conflicting exports* error. A qualified `exports … to` / `opens … to` naming a module that does
> not exist is only a **warning**. An `open module` may not contain any `opens` directive.

> [!NOTE]
> `module`, `open`, `requires`, `transitive`, `exports`, `opens`, `to`, `uses`, `provides` and `with` are
> *contextual* (restricted) keywords: they act as keywords only inside a module declaration, so `int module = 1;` is still
> legal elsewhere.

## Readability and accessibility: exports, requires, transitive, static

**Exports.** A public class in a package that its module does not export is invisible to every other module —
at compile time and at run time:

```java
// file: inventory/module-info.java
module inventory { exports inventory.api; }      // inventory.impl stays encapsulated

// file: shop/shop/Main.java  (module shop { requires inventory; })
import inventory.impl.Db;   // error: package inventory.impl is not visible
                            //   (package inventory.impl is declared in module inventory, which does not export it)
```

A **qualified export** (`exports core.internal to service;`) grants access only to the named modules; for every
other module the package behaves as if it were not exported. That is how the JDK lets `java.desktop` use
internals of `java.base` without exposing them to you.

::check D7-MOD-001

**`requires transitive` — implied readability.** If `service`'s public API returns a `core.model.Money`, every
client of `service` needs to read `core` too. Instead of making each client add `requires core`, `service`
declares `requires transitive core`, and readability flows through:

```java
module core    { exports core.model; exports core.internal to service; }
module service { requires transitive core; exports service; }
module app     { requires service; }   // app reads service AND core
```

`java.se` is the classic example: it is an *aggregator* module that has no packages of its own and only
`requires transitive` other modules.

> [!TRAP]
> Readability is about **naming** types and members. If `service` used a plain `requires core`, then in `app`
> `Money m = Billing.charge(100);` does not compile — but `var m = Billing.charge(100); System.out.println(m);`
> does, because `app` never names `Money`; calling `m.cents()` fails again. The exam likes to test that
> boundary; javac's `-Xlint:exports` warns the API author about the missing `transitive`.

::check D7-MOD-002

**`requires static` — optional dependencies.** `requires static lib;` makes `lib` mandatory at compile time but
optional at run time: resolution does **not** follow static edges. If nothing else requires `lib` and it is not
added with `--add-modules lib`, it is not in the module graph even when its JAR sits on the module path — and
the first line that touches one of its classes throws `NoClassDefFoundError`. Typical uses: annotation-only
libraries and optional integrations guarded by `ModuleLayer.boot().findModule("lib").isPresent()`.

## Reflection: exports versus opens

Frameworks (JPA, JSON mappers, DI containers) read private fields reflectively. In a module system this is a
separate permission:

| Package is… | `Class.forName` | Reflect on public members | `setAccessible(true)` on private members | Compile against it |
|---|---|---|---|---|
| not exported, not open | loads | `IllegalAccessException` | `InaccessibleObjectException` | no |
| exported only | loads | yes | `InaccessibleObjectException` | yes |
| opened only | loads | yes | yes | no |
| exported and opened (or `open module` + `exports`) | loads | yes | yes | yes |

```java
module model { exports model; }                        // app can compile against User, call getName()
module model { exports model; opens model to app; }    // ...and app may also setAccessible on private fields
open module model { exports model; }                   // every package open to every module at run time
open module model { exports model; opens model; }      // error: 'opens' only allowed in strong modules
```

`InaccessibleObjectException` (in `java.lang.reflect`) is unchecked; its message reads *module model does not
"opens model" to module app*. `trySetAccessible()` returns `false` instead of throwing. Note that
`getDeclaredField` itself still succeeds — only *suppressing access checks* is denied. Outside the module
declaration, the launcher option `--add-opens model/model=app` grants the same thing (`ALL-UNNAMED` for the
class path).

> [!TRAP]
> `opens` is not "a stronger `exports`". An opened package that is not exported is invisible to javac:
> `import model.User;` fails with *package model is not visible*, yet the same code done reflectively through
> `Class.forName("model.User")` works at run time — public **and** private members.

::check D7-MOD-005

::check D7-MOD-006

::check D7-MOD-008

## Services: uses, provides and ServiceLoader

Services decouple an API from its implementations: the consumer knows only an interface, providers are
discovered at run time.

```java
// file: api/module-info.java
module api { exports api; }
// api/api/Greeter.java:  public interface Greeter { String greet(String name); }

// file: impl/module-info.java          — impl exports NOTHING
module impl {
    requires api;
    provides api.Greeter with impl.Polite, impl.Loud;
}
// impl/impl/Polite.java: public class Polite implements Greeter { public String greet(String n) {...} }
// impl/impl/Loud.java:   public class Loud { private Loud() {}
//                            public static Greeter provider() { return n -> "HEY " + n.toUpperCase(); } }

// file: app/module-info.java          — app does NOT require impl
module app {
    requires api;
    uses api.Greeter;
}
// app/app/Main.java
ServiceLoader<Greeter> loader = ServiceLoader.load(Greeter.class);
for (Greeter g : loader) System.out.println(g.greet("ana"));        // instantiates lazily while iterating
loader.stream()                                                    // Stream<ServiceLoader.Provider<Greeter>>
      .map(ServiceLoader.Provider::get)                            // get() creates the instance
      .forEach(g -> System.out.println(g.greet("bo")));
Optional<Greeter> first = loader.findFirst();
```

How a provider class becomes an instance (named modules):

1. If the class **declares** a `public static` method `provider()` with no parameters, ServiceLoader calls it.
   Its return type must be the service type or a subtype. The class itself need not implement the service, and
   its constructors are irrelevant (`Loud` above has a private one).
2. Otherwise the class must implement the service and have a **public no-arg constructor**.

javac checks these rules when it compiles `provides … with`: the provider must be in the same module, and a
provider with only a package-private constructor is rejected with *the no arguments constructor of the service
implementation is not public*.

**Service binding.** When `app` is resolved and declares `uses api.Greeter`, the module system also resolves
every observable module that `provides api.Greeter` — here `impl`, although nobody `requires` it, and although
its package is not exported (`--show-module-resolution` prints `app binds impl`). That is why the provider
side can stay completely encapsulated.

> [!TRAP]
> Forgetting `uses` compiles fine, but `ServiceLoader.load(Greeter.class)` in a named module then throws
> `java.util.ServiceConfigurationError` (*api.Greeter: module app does not declare uses*). Also remember the
> iteration order of providers from different modules is not specified — sort or select by `Provider.type()`
> if order matters.

> [!REAL]
> On the class path, providers are listed in `META-INF/services/<fully.qualified.Service>` (one class name per
> line) instead of `provides`. A modular JAR can carry both, so it works on either path.

::check D7-MOD-010

::check D7-MOD-011

Implement the resolution rule yourself to make it stick:

::exercise D7-EX-001

## Graph rules: split packages and cycles

Two structural rules are checked by javac and again when the boot layer is created:

- **No split packages.** A module may not read the same package from two different modules
  (*module app reads package util from both alpha and beta*), and two modules in the same layer may not
  contain the same package. Fix: merge the package into one module or rename it.
- **No cycles in `requires`.** `module a { requires b; }` + `module b { requires a; }` gives
  *cyclic dependence involving a*. Fix: extract the shared types into a third module that both require.
  (Cycles in *readability* can still arise at run time through automatic modules or `Module.addReads`, but
  never through `requires` directives.)

> [!TRAP]
> If a package exists both in a named module and on the class path, the class-path copy is silently ignored:
> the unnamed module reads the named module, and the package is loaded from there. Moving one JAR to the
> module path can therefore "hide" classes that used to be found.

::check D7-MOD-013

::check D7-MOD-014

## Java 25: module import declarations (JEP 511)

> [!J25]
> Final in Java 25 (JEP 511, previewed in 23 and 24). `import module M;` imports, **on demand**, all public
> top-level classes and interfaces of every package that `M` exports to the current module, plus those of every
> module that `M` requires **transitively**.

```java predict
import module java.base;
import module java.sql;
import java.sql.Date;

public class Main {
    public static void main(String[] args) {
        Date d = new Date(0L);
        List<String> names = List.of("a", "b");
        Connection c = null;
        System.out.println(d.getClass().getName() + " " + names.size() + " " + (c == null));
    }
}
```
```output
java.sql.Date 2 true
```

The rules you need:

1. **It works in any compilation unit**, in the unnamed module or a named one. In a named module the current
   module must read `M` (*module app does not read: shop* otherwise). Qualified exports *to* the current module
   are included; non-exported packages are not.
2. **Transitivity matters.** `java.sql` requires `java.logging`, `java.xml` and `java.transaction.xa`
   transitively, so `import module java.sql;` also gives you `Logger`. It does **not** require `java.base`
   transitively, so it does not import `List`. `java.se` does (`import module java.se;` imports the whole
   Java SE API).
3. **Shadowing order:** a single-type import (`import java.sql.Date;`) shadows a type-import-on-demand
   (`import java.util.*;`), which shadows a module import. Two module imports that supply the same simple name
   make that name **ambiguous where it is used** — the import declarations themselves are fine.

```java predict
import module java.base;
import module java.desktop;

public class Main {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        System.out.println(names);
    }
}
```
```output
Compilation fails: reference to List is ambiguous (java.util.List from java.base, java.awt.List from java.desktop)
```

An on-demand import of `java.util.*` (or a single-type `import java.util.List;`) resolves it, because it
outranks the module import of `java.desktop`:

```java predict
import module java.desktop;
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> names = List.of("x");
        System.out.println(names.getClass().getPackageName() + " " + Point.class.getName());
    }
}
```
```output
java.util java.awt.Point
```

> [!TRAP]
> Compact source files (next lesson) import `module java.base` **implicitly**. Adding
> `import module java.desktop;` to one makes `List` ambiguous there, too.

::check D7-MOD-015

## Exam checklist

- Accessibility needs all three: `public`, exported (to you), readable. Missing any one → *not visible* /
  *not accessible* at compile time, `IllegalAccessException`/`IllegalAccessError` at run time.
- `requires transitive` for every module whose types appear in your exported API; `requires static` for
  compile-time-only or optional modules (not resolved at run time on their own).
- `exports` = compile + run time, public members; `opens` = run time only, all members; `open module` cannot
  contain `opens`.
- Services: `uses` in the consumer (else `ServiceConfigurationError`), `provides … with` in the provider,
  `provider()` method before constructor, provider package need not be exported, consumer need not require the
  provider module.
- Split packages and `requires` cycles are compile errors.
- `import module M`: exported-to-you packages of M and of its transitive dependencies; single-type >
  on-demand > module import; ambiguity is reported at the use site.
