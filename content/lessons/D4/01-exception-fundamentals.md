---
id: exc-fundamentals
domain: D4
order: 1
title: Exceptions — Hierarchy, try/catch/finally, Multi-catch & Custom Exceptions
summary: What the compiler checks and what the JVM does at runtime when something goes wrong — checked vs unchecked, catch-or-declare, catch ordering, multi-catch, precise rethrow, finally semantics, propagation, overriding rules and custom exceptions.
minutes: 55
objectives: [D4.1]
prerequisites: []
contract:
  - Classify any exception type as checked or unchecked from its position in the Throwable hierarchy and apply the catch-or-declare rule.
  - Decide whether a try/catch compiles — unreachable catch blocks, catch ordering, multi-catch alternatives, assignments to catch parameters.
  - Trace exactly what prints when an exception propagates through several methods with catch and finally blocks, including return and throw inside finally.
  - Write custom checked and unchecked exceptions that chain their cause, and name the runtime exception each common bug produces.
keyRules:
  - "Checked = Throwable and Exception and their subclasses, EXCEPT RuntimeException, Error and their subclasses."
  - A checked exception that a statement can throw must be caught by an enclosing try or declared in the method's throws clause.
  - Catching a checked exception that the try block cannot throw is a compile error — except for Exception, Throwable (and unchecked types).
  - A catch clause for a subclass placed after a catch for its superclass is unreachable ⇒ compile error ("has already been caught").
  - Multi-catch alternatives may not be related by subclassing, and the multi-catch parameter is implicitly final.
  - finally runs after try/catch on every path except System.exit or a JVM crash; a return or throw in finally replaces whatever the try/catch was doing.
  - "`return x;` evaluates x BEFORE finally runs: changing a primitive (or reassigning the variable) in finally does not change the returned value; mutating the referenced object does."
  - An overriding method may throw fewer or narrower checked exceptions (or any unchecked ones), never new or broader checked ones.
retrieval:
  - Draw the Throwable hierarchy with six concrete classes and mark which are checked.
  - State the three compile errors you can get from catch clauses alone (no try-body changes).
  - Explain why `return x;` followed by `finally { x = 9; }` returns the old value, and when a finally block CAN change what the caller sees.
checks: [D4-EXC-011, D4-EXC-012, D4-EXC-014]
mastery: [D4-EXC-005, D4-EXC-007, D4-EXC-008, D4-EXC-009, D4-EXC-010, D4-EXC-013, D4-EXC-016, D4-EXC-017]
---

## Mental model: an exception is an object that unwinds the stack

An exception is an ordinary object whose class extends `java.lang.Throwable`. Two things happen with it:

1. **At compile time** the compiler looks at the *declared types* that each statement can throw and enforces
   the **catch-or-declare** rule for checked exceptions. It also rejects catch clauses that can never run.
2. **At runtime** a `throw` abandons the current statement and the JVM searches for a handler: first the
   enclosing `try` blocks of the current method (innermost first), then the caller, then the caller's
   caller… Each frame that is abandoned runs its `finally` blocks on the way out. This is **stack
   unwinding**. If no handler exists, the thread dies and the default handler prints
   `Exception in thread "main" …` with the stack trace.

```
                       Throwable                (checked)
                 ┌─────────┴─────────┐
              Exception             Error       (unchecked: StackOverflowError, OutOfMemoryError…)
         ┌───────┴────────┐
   IOException      RuntimeException            (unchecked: NPE, IllegalArgumentException, …)
   SQLException     ├─ IllegalArgumentException ─ NumberFormatException
   (checked)        ├─ IllegalStateException
                    ├─ ArithmeticException, ClassCastException, NullPointerException
                    ├─ IndexOutOfBoundsException ─ ArrayIndexOutOfBounds…, StringIndexOutOfBounds…
                    └─ UnsupportedOperationException
```

**Checked** exceptions are `Throwable`, `Exception` and every subclass of them that is *not* under
`RuntimeException` or `Error`. They model recoverable conditions outside the program's control (a missing
file, a network failure). **Unchecked** exceptions (`RuntimeException`, `Error` and subclasses) model
programming bugs or JVM failures; the compiler does not force you to handle them.

> [!NOTE]
> "Checked" is purely a compile-time idea. The JVM treats all throwables identically at runtime — the
> checked/unchecked distinction exists only in javac.

::check D4-EXC-001

## The rules the compiler enforces

**1. Catch or declare.** If a statement can throw a checked exception `E`, it must be inside a `try` with a
catch for `E` (or a supertype), or the method must declare `throws E` (or a supertype).

```java
void read() throws IOException { ... }        // declares: callers must handle it
void caller() { read(); }                     // error: unreported exception IOException; must be caught or declared to be thrown
```

**2. `throw` vs `throws`.** `throw` is a *statement* that throws one object: `throw new IllegalStateException("x");`.
`throws` is a *clause* in a method/constructor header listing exception types: `void m() throws IOException, SQLException`.
A statement directly after `throw` in the same block is *unreachable statement* — a compile error.

**3. Unreachable catch blocks.** Catching a **checked** exception that the `try` body cannot throw is an error:

```java predict
import java.io.IOException;
public class Main {
    public static void main(String[] args) {
        try {
            System.out.println("no I/O here");
        } catch (IOException e) {
            System.out.println("never");
        }
    }
}
```
```output
Compilation fails: exception java.io.IOException is never thrown in body of corresponding try statement
```

The exceptions to this rule: `catch (Exception e)` and `catch (Throwable e)` always compile (they also
cover unchecked exceptions), and so does any **unchecked** type (`catch (NullPointerException e)`,
`catch (Error e)`).

**4. Catch order.** The JVM tries catch clauses **top to bottom** and picks the first whose type matches.
A subclass catch after its superclass catch could never run, so it is rejected:
*exception java.io.IOException has already been caught*. Unrelated types may appear in any order.

::check D4-EXC-002

::check D4-EXC-003

**5. Multi-catch** `catch (A | B e)` handles several types with one block. Two rules:

- The alternatives **must not be related by subclassing** — `catch (FileNotFoundException | IOException e)`
  ⇒ *Alternatives in a multi-catch statement cannot be related by subclassing*. Just catch `IOException`.
- The parameter is **implicitly final**: `e = null;` ⇒ *multi-catch parameter e may not be assigned*.
  (A single-type catch parameter *can* be reassigned, although it is bad style.)

The static type of `e` in a multi-catch is the closest common supertype of the alternatives, so you can only
call methods that supertype declares.

::check D4-EXC-006

**6. Precise rethrow.** If a catch parameter is effectively final and you `throw e;`, the compiler knows `e`
can only be one of the checked exceptions the `try` body can actually throw — not the declared type of `e`:

```java predict
import java.io.*;
import java.sql.SQLException;
public class Main {
    static void work(int k) throws IOException, SQLException {
        if (k == 0) throw new FileNotFoundException("config.yml");
        throw new SQLException("db");
    }
    static void wrap(int k) throws IOException, SQLException {   // NOT "throws Exception"
        try {
            work(k);
        } catch (Exception e) {
            System.out.println("log " + e.getClass().getSimpleName());
            throw e;                                                // precise rethrow
        }
    }
    public static void main(String[] args) {
        try { wrap(0); }
        catch (IOException | SQLException e) { System.out.println("main " + e.getMessage()); }
    }
}
```
```output
log FileNotFoundException
main config.yml
```

Assign anything to `e` inside that catch (`e = new Exception();`) and the precision is lost: `throw e;` now
throws `Exception`, which `wrap` does not declare ⇒ *unreported exception java.lang.Exception*.

> [!J25]
> **Unnamed catch parameters** (JEP 456, final since Java 22, so part of Java 25): if a handler does not use
> the exception object, write `catch (NumberFormatException _) { return 0; }`. Several catch clauses in the
> same try may all use `_`, and it works in multi-catch too: `catch (IOException | SQLException _)`.
> You cannot *read* `_` — `System.out.println(_)` does not compile.

::check D4-EXC-015

## finally — the block that always runs (almost)

A `finally` block runs after the `try` (and after a `catch`, if one ran) on **every** path: normal
completion, `return`, `break`/`continue`, or an exception that is caught or that propagates. The only common
exception is `System.exit(...)`, which stops the JVM without running pending finally blocks.

What makes finally tricky is the interaction with `return`:

- `return expr;` inside `try` **evaluates `expr` first and saves the value**, then runs `finally`, then returns
  the saved value. Changing a local variable in `finally` does not change the saved value — but if the saved
  value is a *reference*, mutating the object it points to is visible to the caller.
- A `return` inside `finally` **overrides** any earlier return and **discards** a pending exception.
- A `throw` inside `finally` (or any exception escaping it) **replaces** the pending exception or return; the
  original exception is lost (it is not even attached as "suppressed").

```java predict
public class Main {
    static int counter() {
        int x = 1;
        try { return x; }
        finally { x = 99; }                       // too late: 1 was already saved
    }
    static StringBuilder builder() {
        StringBuilder sb = new StringBuilder("a");
        try { return sb; }                        // saves the REFERENCE
        finally { sb.append("b"); sb = null; }    // mutation visible, reassignment not
    }
    static int swallow() {
        try { throw new RuntimeException("lost"); }
        finally { return 7; }                     // discards the exception
    }
    public static void main(String[] args) {
        System.out.println(counter());
        System.out.println(builder());
        System.out.println(swallow());
    }
}
```
```output
1
ab
7
```

When `finally` completes normally, the pending exception continues to propagate:

```java predict
public class Main {
    public static void main(String[] args) {
        int x = 0;
        try {
            x = 1;
            throw new RuntimeException("try");
        } catch (RuntimeException e) {
            x = 2;
            throw new IllegalStateException("from catch");
        } finally {
            x = 3;
            System.out.println("x=" + x);
        }
    }
}
```
```output
x=3
Exception in thread "main" java.lang.IllegalStateException: from catch
```

> [!TRAP]
> A `try` needs at least one `catch` **or** a `finally`. `try { }` alone does not compile, but `try { } finally { }`
> does. And the order is fixed: `try` → `catch`es → `finally`. A catch after finally is a syntax error.

::check D4-EXC-004

## Propagation and stack unwinding

When nothing in the current method handles an exception, the method ends abruptly and the exception is
rethrown at the call site in the caller. Every `finally` block passed on the way runs, innermost first.
A catch for an **unrelated** type in an intermediate frame is simply skipped.

```java predict
class AppException extends RuntimeException {
    AppException(String msg) { super(msg); }
}
public class Main {
    static void level3() { throw new AppException("db down"); }
    static void level2() {
        try { level3(); }
        finally { System.out.print("L2-finally "); }
    }
    static void level1() {
        try { level2(); System.out.print("never "); }
        catch (IllegalStateException e) { System.out.print("L1-catch "); }   // wrong type: skipped
        finally { System.out.print("L1-finally "); }
    }
    public static void main(String[] args) {
        try { level1(); System.out.print("main-after "); }
        catch (AppException e) { System.out.print("main-catch:" + e.getMessage()); }
        System.out.println();
    }
}
```
```output
L2-finally L1-finally main-catch:db down
```

## Overriding and the throws clause

The caller of an overridden method only knows the *declared* type. If `Parent.load()` promises to throw at
most `IOException`, a subclass may not surprise callers with something broader:

| `Parent` declares | Override declares | Compiles? |
|---|---|---|
| `void load() throws IOException` | `void load()` | yes — fewer is fine |
| `void load() throws IOException` | `void load() throws FileNotFoundException` | yes — narrower |
| `void load() throws IOException` | `void load() throws IOException, IllegalStateException` | yes — unchecked never matter |
| `void load() throws IOException` | `void load() throws Exception` | **no** — broader checked |
| `void load()` | `void load() throws IOException` | **no** — new checked exception |

javac reports *m() in C cannot override m() in P — overridden method does not throw java.lang.Exception*.
The same rule applies when a class implements an interface method.

> [!TRAP]
> Which `throws` clause matters depends on the **reference type**. If `FileLoader.load()` declares nothing but
> `Loader.load()` declares `throws Exception`, then `new FileLoader().load()` needs no handler, while
> `Loader l = new FileLoader(); l.load();` does.

## Custom exceptions and cause chaining

Extend `Exception` for a checked exception, `RuntimeException` for an unchecked one. Provide the
constructors your callers need — at least `(String message)` and `(String message, Throwable cause)` — and
pass them to `super(...)`. **Exception translation** wraps a low-level exception in a domain one, keeping the
original as the *cause*:

```java predict
class ValidationException extends Exception {
    ValidationException(String message, Throwable cause) { super(message, cause); }
}
public class Main {
    static int parseAge(String s) throws ValidationException {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            throw new ValidationException("bad age: " + s, e);
        }
    }
    public static void main(String[] args) {
        try {
            parseAge("4O");
        } catch (ValidationException e) {
            System.out.println(e.getMessage());
            System.out.println(e.getCause().getClass().getSimpleName());
            System.out.println(e);
        }
    }
}
```
```output
bad age: 4O
NumberFormatException
ValidationException: bad age: 4O
```

`toString()` of a throwable is `className + ": " + message` (or just the class name when the message is
`null`). A constructor that only takes a cause — `super(cause)` — sets the message to `cause.toString()`.

## Common runtime exceptions and what triggers them

| Exception | Typical trigger | Thrown by |
|---|---|---|
| `NullPointerException` | calling a method/field on `null`, unboxing `null`, `throw null` | JVM |
| `ArithmeticException` | integer `/` or `%` by zero (`5.0 / 0` is `Infinity`, no exception) | JVM |
| `ArrayIndexOutOfBoundsException` | `a[a.length]`, `a[-1]` | JVM |
| `StringIndexOutOfBoundsException` | `"abc".charAt(3)`, `"abc".substring(4)` | API |
| `ClassCastException` | `(String) obj` where obj is really an `Integer` | JVM |
| `NegativeArraySizeException` | `new int[-1]` | JVM |
| `NumberFormatException` (extends `IllegalArgumentException`) | `Integer.parseInt("12a")`, `parseInt(" 4")` | API |
| `IllegalArgumentException` | a method rejects a parameter value | API / your code |
| `IllegalStateException` | a method is called at the wrong time (e.g. `Iterator.remove()` twice) | API / your code |
| `UnsupportedOperationException` | modifying `List.of(...)`, `add` on `Arrays.asList(...)` | API |
| `StackOverflowError` (an `Error`) | unbounded recursion | JVM |

> [!TRAP]
> `catch (Exception e)` does **not** catch `StackOverflowError` or any other `Error` — they are not
> `Exception`s. Only `catch (Throwable t)` or `catch (Error e)` does.

## What if…? One change at a time

| Change | Result |
|---|---|
| Add `catch (FileNotFoundException e)` *after* `catch (IOException e)` | compile error: already caught |
| Swap them (subclass first) | compiles; FNF goes to the first handler |
| Replace `catch (IOException e)` with `catch (Exception e)` around code that throws nothing | compiles |
| Replace it with `catch (SQLException e)` around code that throws nothing | compile error: never thrown |
| `catch (IOException \| Exception e)` | compile error: related by subclassing |
| `catch (IOException \| RuntimeException e) { e = null; }` | compile error: may not be assigned |
| Add `return 2;` to a `finally` after `try { return 1; }` | method returns 2 |
| Add `System.exit(0);` at the end of `try` | finally does **not** run |
| A statement after `throw new X();` in the same block | compile error: unreachable statement |

## Exam traps checklist

> [!TRAP]
> - `RuntimeException` extends `Exception`, so `catch (Exception e)` *does* catch every runtime exception.
> - `NumberFormatException` is an `IllegalArgumentException`: `catch (IllegalArgumentException e)` catches it,
>   and `catch (NumberFormatException | IllegalArgumentException e)` does not compile.
> - Declaring `main(String[] args) throws Exception` silences catch-or-declare inside `main` — useful in exam
>   code, so check the header before answering "does not compile".
> - A lambda for a functional interface whose method declares no checked exception cannot throw one.
> - `finally { return ...; }` swallows exceptions silently — legal, but a well-known bug pattern.

## Practice

::check D4-EXC-011

::check D4-EXC-012

::check D4-EXC-014
