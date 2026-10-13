---
id: oop-constructors
domain: D3
order: 2
title: Constructors, Initialization Order & Flexible Constructor Bodies
summary: How an object is actually born — default constructors, this()/super() chaining, the exact initialization order, records' canonical constructors, and Java 25's flexible constructor bodies.
minutes: 50
objectives: [D3.2]
prerequisites: [oop-objects-lifecycle]
contract:
  - Predict the exact order in which static initializers, instance initializers, field initializers and constructor bodies run — across an inheritance chain.
  - Decide whether a constructor compiles, citing the precise rule (default constructor, implicit super(), single explicit invocation, prologue restrictions).
  - Use Java 25 flexible constructor bodies to validate arguments and assign fields before super(...), and explain what the prologue may not do.
  - Write compact and non-compact canonical constructors for records and explain how they differ.
keyRules:
  - The compiler adds a no-arg default constructor only if the class declares no constructor at all.
  - If a constructor does not start a chain with this(...) or super(...), the compiler inserts super() — which must resolve to an accessible no-arg superclass constructor.
  - A constructor may contain at most one explicit constructor invocation (this(...) or super(...)), and since Java 25 it may be preceded by a prologue.
  - "Prologue (Java 25): no use of this, no instance method calls, no reading instance fields, no return — but you may assign fields of this class that have no initializer."
  - "Order for new C(): super chain first; then C's instance field initializers and instance initializer blocks in textual order; then the rest of C's constructor body."
  - Static initialization runs once per class, at first active use, superclass before subclass.
  - A compact canonical record constructor assigns the fields automatically after its body; a non-compact canonical constructor must assign every field itself.
retrieval:
  - From memory, write the initialization sequence for `new Child()` where Child extends Parent and both have static blocks, instance blocks and field initializers.
  - List four things a constructor prologue may not do and one thing it may.
  - Explain why an overridden method called from a superclass constructor can observe a field as null — and the one kind of field that is not affected.
checks: [D3-CTR-001, D3-CTR-002]
mastery: [D3-CTR-006, D3-CTR-007, D3-CTR-008, D3-CTR-009, D3-CTR-010]
---

## Mental model: an object is built from the top down

When you write `new Savings("sv-1", 0.03)`, the JVM first allocates memory for **every** field in the
object — the ones declared in `Savings`, in `Account`, all the way up to `Object` — and sets them to their
default values (`0`, `false`, `null`). Only *then* does any constructor code run.

Construction is a chain of calls that goes **up** before it does any work: each constructor first delegates
to another constructor (`this(...)` in the same class or `super(...)` in the parent), until `Object()` is
reached. Then the work happens on the way back **down**: the topmost class initializes its part of the
object first, the most specific class last.

Think of a building: you cannot fit the windows of floor 3 before floors 1 and 2 exist. A subclass
constructor body can rely on the superclass part being fully constructed.

> [!NOTE]
> "Default value" and "initialized" are different things. Between allocation and the moment a field's
> initializer runs, the field holds its default value — and it is observable if code runs in that window.
> That window is where most exam traps live.

## The rules the compiler enforces

**1. The default constructor.** If (and only if) a class declares *no* constructor, the compiler adds a
no-arg constructor with the same access as the class, whose body is just `super();`.

```java
class Point {
    int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }
}
// new Point() ⇒ does not compile: declaring Point(int,int) suppressed the default constructor
```

**2. The implicit `super()`.** If a constructor body does not contain an explicit `this(...)` or
`super(...)`, the compiler inserts `super();` at the start. That call must resolve to an accessible no-arg
constructor in the parent, or the *subclass* fails to compile:

```java
class Vehicle { Vehicle(String id) { } }
class Car extends Vehicle {
    Car() { System.out.println("car"); }   // error here: constructor Vehicle cannot be applied to given types
}
```

**3. At most one explicit constructor invocation.** `this(...)` delegates to another constructor of the same
class; `super(...)` to the parent. A constructor can contain one or the other, once. (`this(); super();`
⇒ *redundant explicit constructor invocation*.) A chain of `this(...)` calls must not loop — javac reports
*recursive constructor invocation*.

**4. Final fields** must be definitely assigned exactly once by the end of every constructor path. If a
constructor delegates with `this(...)`, the delegated constructor already assigned them — assigning again
is an error (*variable might already have been assigned*).

> [!RULE]
> Constructors are not inherited and are not members. A subclass never "gets" `Vehicle(String)`; it must
> declare its own constructor and call `super(id)` explicitly.

::check D3-CTR-001

## Initialization order — the full algorithm

**Class initialization** (static fields and `static {}` blocks) runs **once**, the first time the class is
actively used (instance created, static method called, non-constant static field accessed). A superclass is
initialized before its subclass. Within one class, static initializers run in textual order.

**Instance creation** `new C(args)`:

1. Allocate the object; every field gets its default value.
2. Run C's constructor. Its prologue (Java 25, see below) runs first, then the explicit or implicit
   `this(...)`/`super(...)`.
3. After the `super(...)` call returns — and only for the constructor that called `super`, not one that
   called `this` — run **C's instance variable initializers and instance initializer blocks, in textual
   order**.
4. Run the rest of the constructor body (the epilogue).

```java predict
class Base {
    static { System.out.print("S-Base "); }
    { System.out.print("I-Base "); }
    Base() { System.out.print("C-Base "); }
}
class Derived extends Base {
    static { System.out.print("S-Derived "); }
    private int x = log("F-Derived ");
    { System.out.print("I-Derived "); }
    Derived() { super(); System.out.print("C-Derived "); }
    static int log(String s) { System.out.print(s); return 1; }
}
public class Main {
    public static void main(String[] args) {
        new Derived();
        System.out.println();
        new Derived();
    }
}
```
```output
S-Base S-Derived I-Base C-Base F-Derived I-Derived C-Derived
I-Base C-Base F-Derived I-Derived C-Derived
```

Walk through it: creating the first `Derived` triggers class initialization of `Base` then `Derived`
(both static blocks). Then `Derived()` calls `super()`, which runs `Base`'s instance initializer and body.
Back in `Derived`, the field initializer `x = log(...)` and the instance block run in source order, then
the rest of `Derived()`. The second `new Derived()` skips static initialization entirely.

> [!TRAP]
> A field initializer and an instance initializer block are run **in the order they appear in the source**,
> not "fields first". Move the `{ ... }` block above `private int x = ...` and the output becomes
> `I-Derived F-Derived`.

## Calling overridable methods from a constructor

Because the superclass constructor runs before the subclass's field initializers, a method overridden in
the subclass and called from the superclass constructor sees the subclass's fields **in their default
state**:

```java predict
class Parent {
    Parent() { describe(); }
    void describe() { System.out.println("Parent"); }
}
class Child extends Parent {
    private String name = "Child";
    private final int size = 3;
    @Override void describe() { System.out.println(name + " " + size); }
}
public class Main {
    public static void main(String[] args) {
        new Child().describe();
    }
}
```
```output
null 3
Child 3
```

`name` is still `null` during `Parent()`. But `size` prints `3`, not `0`: a `final` field of primitive or
`String` type initialized with a compile-time constant is a **constant variable**, and the compiler inlines
its value wherever it is read.

> [!TRAP]
> Change `private final int size = 3;` to `private final int size = Integer.valueOf(3);` and the first line
> becomes `null 0` — the initializer is no longer a constant expression, so the field is read at runtime,
> before it was assigned.

::check D3-CTR-002

## Java 25: flexible constructor bodies (JEP 513)

> [!J25]
> Final in Java 25. Before Java 25, `this(...)`/`super(...)` had to be the **first statement**. Now a
> constructor body may have a **prologue** — statements before the explicit constructor invocation — and an
> **epilogue** after it.

The prologue exists so that you can validate or transform arguments *before* paying for superclass
construction, and initialize your own fields before the superclass can observe them:

```java predict
class Account {
    private final String id;
    Account(String id) { this.id = id; System.out.println("Account " + id); }
}
class Savings extends Account {
    private final double rate;
    Savings(String id, double rate) {
        if (rate < 0) throw new IllegalArgumentException("negative rate");   // fail fast
        String normalized = id.strip().toUpperCase();                         // local variables are fine
        this.rate = rate;                                                     // early field assignment
        super(normalized);
        System.out.println("rate " + this.rate);                              // epilogue: normal code
    }
}
public class Main {
    public static void main(String[] args) {
        new Savings("  sv-1 ", 0.03);
    }
}
```
```output
Account SV-1
rate 0.03
```

The prologue runs in an **early construction context**. The object exists but is not yet initialized, so
the compiler forbids anything that could observe it:

| In the prologue you may… | You may not… |
|---|---|
| declare and use local variables | read any instance field (`System.out.println(x)`) |
| call **static** methods, throw exceptions, use `if`/loops | call instance methods (`helper()`), or pass `this` anywhere |
| assign a field of **this class that has no initializer** (`this.rate = rate`) | assign a field that has an initializer (`int y = 5;` ⇒ error) |
| | use `return` |

Early assignment fixes the classic "overridden method sees null" problem:

```java predict
class Shape {
    Shape() { System.out.println("area=" + area()); }
    double area() { return 0; }
}
class Square extends Shape {
    private final double side;
    Square(double side) {
        this.side = side;   // assigned before Shape() runs
        super();
    }
    @Override double area() { return side * side; }
}
public class Main {
    public static void main(String[] args) {
        new Square(3);
    }
}
```
```output
area=9.0
```

And a prologue that reads a field does not compile:

```java predict
public class Main {
    int x;
    Main(int v) {
        System.out.println(x);
        super();
    }
    public static void main(String[] args) { }
}
```
```output
Compilation fails: cannot reference x before supertype constructor has been called
```

> [!TRAP]
> Field initializers and instance initializer blocks still run *after* `super(...)` returns. A prologue can
> assign `side`, but a field declared `private double side = 1;` cannot be assigned early at all
> (*cannot assign initialized field 'side' before supertype constructor has been called*).

## Records: canonical, compact and non-canonical constructors

A record `record Range(int lo, int hi) {}` gets a **canonical constructor** `Range(int lo, int hi)` that
assigns both fields. You can replace it in two ways:

```java
record Range(int lo, int hi) {
    Range {                                    // compact canonical constructor: no parameter list
        if (lo > hi) throw new IllegalArgumentException(lo + " > " + hi);
        // fields are assigned automatically AFTER this body, from the (possibly reassigned) parameters
    }
}

record Range2(int lo, int hi) {
    Range2(int lo, int hi) {                   // explicit canonical constructor
        this.lo = lo;                          // must assign every field itself
        this.hi = hi;
    }
}
```

In a compact constructor, assigning to the *parameter* changes what gets stored, and assigning
`this.lo = …` is a compile error. Any other ("non-canonical") record constructor must delegate with
`this(...)` — and in Java 25 it may do work before that call:

```java predict
record Pair(int x, int y) {
    Pair(int v) {
        System.out.println("pre");
        this(v, v);
    }
}
public class Main {
    public static void main(String[] args) {
        System.out.println(new Pair(2));
    }
}
```
```output
pre
Pair[x=2, y=2]
```

> [!RULE]
> Records cannot declare instance fields or instance initializers, cannot call `super(...)` explicitly, and
> every non-canonical constructor must end up invoking the canonical one via `this(...)`.

## What if…? One change at a time

| Change | Result |
|---|---|
| Add `Point(int x, int y)` to a class that was used as `new Point()` | `new Point()` no longer compiles |
| Parent only has `Parent(String)`; child declares no constructor | child does not compile — its default constructor calls `super()` |
| Make the parent's no-arg constructor `private` (different classes) | child constructors calling `super()` do not compile |
| `this(1); v = 2;` where `this(int)` already assigns final `v` | error: *variable v might already have been assigned* |
| Move an instance initializer block above a field initializer | their outputs swap order |
| Prologue calls `helper()` (an instance method) | error: *cannot reference helper() before supertype constructor has been called* |
| Prologue assigns a `static` field | allowed — static fields are not part of the instance |

## Exam traps checklist

> [!TRAP]
> - `void Main() {}` is a **method** named like the class, not a constructor. The class still gets a default constructor.
> - Instance initializers run once **per object**, after `super(...)`, even if the class has several constructors — but not in a constructor that delegates with `this(...)` (they run in the delegated-to one).
> - A `static` block runs once, even if `new` is called many times; it does **not** run if you only use a compile-time constant like `Config.MAX` where `static final int MAX = 10;`.
> - Private constructors are inherited by nobody and accessible only inside the top-level class that encloses them.

## Practice

::check D3-CTR-003

::check D3-CTR-004

::check D3-CTR-005

::exercise D3-EX-001
