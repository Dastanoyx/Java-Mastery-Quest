---
id: exc-try-with-resources
domain: D4
order: 2
title: try-with-resources, Closing Order & Suppressed Exceptions
summary: How try-with-resources is translated, what may appear in the resource list, the exact order of close/catch/finally, how suppressed exceptions are recorded, and how the close() signature drives catch-or-declare.
minutes: 40
objectives: [D4.1]
prerequisites: [exc-fundamentals]
contract:
  - Decide whether a try-with-resources header compiles (AutoCloseable type, declaration vs effectively final variable, scope, reassignment).
  - Predict the full output of a try-with-resources with several resources, a catch and a finally, including when a resource constructor throws.
  - Explain which exception reaches the caller when both the body and close() throw, and read the others with getSuppressed().
  - Determine which checked exceptions a try-with-resources forces you to handle from the close() signature of the declared resource type.
keyRules:
  - A resource must be of a type that implements AutoCloseable (Closeable extends it); anything else ⇒ compile error.
  - Since Java 9 the resource list may name an existing final or effectively final variable (`try (r)`), or a final field (`try (this.res)`); `try (new Res())` is not allowed.
  - Resources are closed in the REVERSE order of their declaration, and only those that were successfully initialized.
  - All resources are closed BEFORE any catch or finally block of the same statement runs.
  - If the body throws and close() also throws, the body's exception propagates and the close() exception is added to it as suppressed.
  - Resource variables declared in the header are implicitly final and are scoped to the try block only.
  - A null resource is allowed; close() is simply not called on it.
  - "The implicit close() call counts for catch-or-declare: AutoCloseable.close() throws Exception, Closeable.close() throws IOException — unless the declared type narrows it."
retrieval:
  - Write the output order for a try-with-resources with resources A and B, a body that throws, a catch and a finally.
  - Name four things that are illegal in a try-with-resources header.
  - Explain the difference between a suppressed exception and a cause.
checks: [D4-TWR-001, D4-TWR-002]
mastery: [D4-TWR-003, D4-TWR-004, D4-TWR-005, D4-TWR-006, D4-TWR-007]
---

## Mental model: a finally block the compiler writes for you

Before Java 7, closing a resource correctly needed a `finally` with a null check and a nested `try`, and an
exception thrown by `close()` would silently *replace* the real problem from the body. try-with-resources
asks the compiler to generate that code:

```java
try (Res r = new Res()) {
    body(r);
}
// is roughly translated to
Res r = new Res();
Throwable primary = null;
try {
    body(r);
} catch (Throwable t) {
    primary = t;
    throw t;
} finally {
    if (r != null) {
        if (primary != null) {
            try { r.close(); } catch (Throwable s) { primary.addSuppressed(s); }
        } else {
            r.close();
        }
    }
}
```

Three consequences follow directly from that picture, and they are what the exam tests:

1. `close()` runs when the block is left **for any reason**, and **before** your own `catch`/`finally`
   (they wrap the generated code from the outside).
2. A `null` resource is skipped.
3. If the body already failed, an exception from `close()` does not replace it; it is **suppressed** —
   attached to the primary exception.

## The rules for the resource header

```java
try (Res a = new Res("A"); Res b = new Res("B")) { ... }   // declarations, separated by ;
try (var in = Files.newBufferedReader(p)) { ... }           // var is fine
try (existing) { ... }                                      // Java 9+: final / effectively final variable
try (this.res) { ... }                                      // a final field also qualifies
```

| Header | Compiles? | Why |
|---|---|---|
| `try (String s = "x")` | no | *try-with-resources not applicable to variable type* — `String` is not `AutoCloseable` |
| `try (new Res())` | no | must be a declaration or a reference to a (effectively) final variable |
| `try (r)` where `r` is reassigned somewhere | no | *neither final nor effectively final* — even if the reassignment is **after** the try |
| `try (Res r = new Res()) { r = null; }` | no | header resources are implicitly final: *auto-closeable resource r may not be assigned* |
| `try (Res r = new Res()) {}` then `r.close()` after the block | no | the variable's scope is the try block only |
| `try (Res r = null) { ... }` | yes | allowed; `close()` is not called |
| `try (Res r = new Res()) { }` with no catch / finally | yes | unlike a plain `try`, neither is required |
| `try (var _ = open()) { ... }` | yes | Java 22+ unnamed variable (JEP 456) — the resource is still closed |

> [!J25]
> The unnamed variable `_` (JEP 456, final in Java 22) is handy when you need a resource only for its side
> effect — for example a lock guard: `try (var _ = lock.acquire()) { ... }`. It is still closed normally.

::check D4-TWR-001

## Order of events — the full algorithm

1. Initialize resources **left to right**. If an initializer throws, the resources already opened are
   closed (in reverse order) and the remaining ones are never created.
2. Run the body.
3. Close every successfully-initialized, non-null resource **right to left** (reverse declaration order).
4. If an exception is pending, run the matching `catch` of *this* statement.
5. Run the `finally` of *this* statement.

```java predict
class Gate implements AutoCloseable {
    private final String name;
    Gate(String name) { this.name = name; System.out.print("open-" + name + " "); }
    @Override public void close() { System.out.print("close-" + name + " "); }
}
public class Main {
    public static void main(String[] args) {
        try (Gate a = new Gate("a"); Gate b = new Gate("b"); Gate c = new Gate("c")) {
            System.out.print("work ");
            throw new IllegalStateException();
        } catch (IllegalStateException e) {
            System.out.print("catch ");
        } finally {
            System.out.print("finally");
        }
        System.out.println();
    }
}
```
```output
open-a open-b open-c work close-c close-b close-a catch finally
```

When a resource **constructor** fails, only what was opened is closed — and the body never runs:

```java predict
class Res implements AutoCloseable {
    final String n;
    Res(String n) {
        if (n.equals("B")) throw new IllegalStateException("cannot open B");
        this.n = n;
        System.out.println("open " + n);
    }
    @Override public void close() { System.out.println("close " + n); }
}
public class Main {
    public static void main(String[] args) {
        try (Res a = new Res("A"); Res b = new Res("B"); Res c = new Res("C")) {
            System.out.println("body");
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
    }
}
```
```output
open A
close A
cannot open B
```

::check D4-TWR-002

## Suppressed exceptions

`Throwable.addSuppressed(Throwable)` records "this also went wrong while handling the primary failure";
`getSuppressed()` returns them as an array (empty, never null, if there are none). A *cause* is different:
it says "this exception was **caused by** that one" and is set via the constructor or `initCause`.

```java predict
class Res implements AutoCloseable {
    private final String n;
    Res(String n) { this.n = n; }
    @Override public void close() { throw new IllegalStateException("close " + n); }
}
public class Main {
    public static void main(String[] args) {
        try (Res a = new Res("A"); Res b = new Res("B")) {
            throw new RuntimeException("body");
        } catch (RuntimeException e) {
            System.out.println("caught: " + e.getMessage());
            for (Throwable s : e.getSuppressed())
                System.out.println("suppressed: " + s.getMessage());
        }
    }
}
```
```output
caught: body
suppressed: close B
suppressed: close A
```

If the body completes normally, the **first** exception from `close()` becomes the primary exception (later
close failures are suppressed into it). The catch then sees the close exception:

```java predict
class Res implements AutoCloseable {
    @Override public void close() { throw new IllegalStateException("from close"); }
}
public class Main {
    public static void main(String[] args) {
        try (Res r = new Res()) {
            System.out.println("body ok");
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage() + ", suppressed=" + e.getSuppressed().length);
        }
    }
}
```
```output
body ok
from close, suppressed=0
```

> [!TRAP]
> A plain `try/finally` that throws from `finally` **loses** the original exception (no suppression). Only
> try-with-resources records suppressed exceptions automatically.

## Closeable vs AutoCloseable and catch-or-declare

| Interface | Package | `close()` declares | Notes |
|---|---|---|---|
| `AutoCloseable` | `java.lang` | `throws Exception` | Java 7; the general contract — close need not be idempotent |
| `Closeable` | `java.io` | `throws IOException` | extends `AutoCloseable`; close should be idempotent |

The implicit `close()` call is checked like any method call, **using the declared type of the resource**:

- If your class overrides `close()` without a `throws` clause and the variable has that class type, no
  handler is needed.
- If your class's `close()` keeps `throws Exception`, the try-with-resources must catch or declare
  `Exception` — javac even says *exception thrown from implicit call to close() on resource variable 'r'*.
- If the variable's declared type is `Closeable` (even though the object's `close()` throws nothing), you
  must handle `IOException`.
- An implementation of `Closeable.close()` cannot widen to `throws Exception` — the normal overriding rule.

```java predict
class Res implements AutoCloseable {
    @Override public void close() throws Exception { }
}
public class Main {
    public static void main(String[] args) {
        try (Res r = new Res()) {
            System.out.println("body");
        }
    }
}
```
```output
Compilation fails: unreported exception java.lang.Exception; must be caught or declared to be thrown
```

## What if…? One change at a time

| Change | Result |
|---|---|
| Swap the declaration order of two resources | their close lines swap |
| Body throws, and both `close()` methods throw | body exception propagates with 2 suppressed (last-declared first) |
| Body completes, one `close()` throws | that close exception is the primary one |
| Initialize a resource with `null` | no NPE; that resource is just not closed |
| Add `r = new Res();` after `try (r) { }` | compile error on the header: not effectively final |
| Declared type is `Closeable`, caller has no handler | compile error: unreported IOException |
| Remove the `catch` and `finally` | still compiles (unlike a plain `try`) |

## Exam traps checklist

> [!TRAP]
> - The `catch` of a try-with-resources sees the resources **already closed** — and cannot use them (out of scope).
> - Close order is reverse of **declaration**, not reverse of "use".
> - `getSuppressed()` returns an empty array, not `null`.
> - A try-with-resources may have zero catch blocks; a plain try may not.
> - The resource variable is final: reassigning it inside the block is a compile error even though it was
>   declared without `final`.

## Practice

::exercise D4-EX-001
