---
id: oop-objects-lifecycle
domain: D3
order: 1
title: Objects, References, Nested Classes & the Object Lifecycle
summary: What a reference really is, why Java is always pass-by-value, identity versus equality, the four kinds of nested classes and how to instantiate each, and exactly when an object becomes eligible for garbage collection.
minutes: 55
objectives: [D3.1]
prerequisites: []
contract:
  - Trace reference assignments and method calls on a stack/heap diagram and predict the output, distinguishing "reassign the parameter" from "mutate the object".
  - Choose correctly between == (identity) and equals (equality) and predict both for classes, records and Strings.
  - Declare and instantiate static nested, inner, local and anonymous classes, including outer.new Inner() and Outer.this.field.
  - Count the objects eligible for garbage collection after a sequence of assignments, including islands of isolation.
keyRules:
  - A variable of a class type holds a reference (or null), never the object itself. Assignment copies the reference.
  - Java is always pass-by-value. For objects, the value passed is a copy of the reference — a method can mutate the object but cannot make the caller's variable point elsewhere.
  - "== on references compares identity; equals compares whatever the class defines (Object.equals is identity, records compare components)."
  - An inner (non-static member) class instance needs an enclosing instance — outer.new Inner(); a static nested class does not — new Outer.Nested().
  - Local and anonymous classes may capture only final or effectively final local variables.
  - An object is eligible for GC when no live thread can reach it. Unreachable cycles (islands of isolation) are eligible. System.gc() is only a hint; finalize() is deprecated for removal.
retrieval:
  - Draw the stack and heap after `Box a = new Box(); Box b = a; b = new Box();` — how many objects, how many arrows?
  - Write the creation expression for an inner class from a static method, and for a static nested class.
  - Explain in two sentences why a cycle of two objects can be garbage collected.
checks: [D3-OBJ-002, D3-OBJ-003]
mastery: [D3-OBJ-004, D3-OBJ-006, D3-OBJ-007, D3-OBJ-008, D3-OBJ-011]
---

## Mental model: variables hold arrows, objects live on the heap

A **class** is a blueprint: it declares fields and methods. An **object** is one concrete instance of it,
created at runtime with `new`, which allocates memory on the **heap**, runs a constructor, and returns a
**reference** — think of it as an arrow pointing at the object.

Local variables and parameters live in the current method's **stack frame**. A variable of a primitive type
holds the value itself (`int n = 5`); a variable of a reference type holds an arrow, or `null` (no arrow).

```java
Account a = new Account("Yassin", 100);   // 1 object on the heap, 1 arrow (a)
Account b = a;                            // still 1 object, now 2 arrows (aliasing)
b = null;                                 // b drops its arrow; the object is untouched
```

Every interesting exam question on this objective is solved the same way: **draw the boxes and move the
arrows, one line at a time**.

> [!NOTE]
> "Stack" and "heap" are a mental model, not a JLS guarantee — the JVM may optimize objects away
> (escape analysis). For predicting program behaviour, the model is exactly right.

## References, aliasing and pass-by-value

Java passes **every** argument by value. For a reference type, the value copied into the parameter is the
reference. So the method and the caller share the object, but each has its own variable:

- `param.field = ...` / `param.mutator()` → changes the shared object, visible to the caller.
- `param = new X(...)` → only redirects the method's own copy of the arrow; the caller never sees it.

```java predict
class Account {
    String owner;
    int balance;
    Account(String owner, int balance) { this.owner = owner; this.balance = balance; }
}
public class Main {
    static void deposit(Account acc, int amount) { acc.balance += amount; }
    static void replace(Account acc) { acc = new Account("Mallory", 0); }
    public static void main(String[] args) {
        Account a = new Account("Yassin", 100);
        Account b = a;
        deposit(b, 50);
        replace(a);
        System.out.println(a.owner + " " + a.balance + " " + (a == b));
    }
}
```
```output
Yassin 150 true
```

`b = a` makes two arrows to one object; `deposit` follows its copy of the arrow and mutates that object.
`replace` points its parameter at a brand-new `Account` that is unreachable as soon as the method returns.

> [!TRAP]
> `String` and the wrapper classes (`Integer`, …) are **immutable**: `s = s + "!"` or `count++` on an
> `Integer` inside a method creates a new object and rebinds the parameter. The caller's variable is
> unchanged — it looks like "pass-by-value for Strings", but it is the same rule as above.

::check D3-OBJ-002

### `null`

`null` is the absence of an arrow. Fields of reference type default to `null`; local variables have no
default at all and must be assigned before use. Concatenating `null` prints `"null"`; dereferencing it —
`ref.field`, `ref.method()`, `ref.length` on an array — throws `NullPointerException`. Accessing a
**static** member through a null reference does *not* throw, because the compiler resolves it by the
declared type.

### Identity (`==`) vs equality (`equals`)

```java predict
public class Main {
    public static void main(String[] args) {
        String s1 = new String("java");
        String s2 = new String("java");
        String s3 = s1;
        System.out.println(s1 == s2);
        System.out.println(s1.equals(s2));
        System.out.println(s1 == s3);
        s3 = null;
        System.out.println(s1);
    }
}
```
```output
false
true
true
java
```

`new String(...)` always creates a distinct object, so `s1 == s2` is `false`; `String.equals` compares
characters. Setting `s3 = null` drops one arrow — the object is still reachable through `s1`.

| Type | `a == b` | `a.equals(b)` |
|---|---|---|
| your class, no `equals` override | same object? | same object? (inherited `Object.equals`) |
| `record` | same object? | all components equal? |
| `String`, wrappers | same object? (literals/cached values may share) | same content |
| `StringBuilder` | same object? | same object! (`equals` is not overridden) |

## Nested classes: four kinds, four creation rules

A class declared inside another class or block is a **nested class**. The exam expects you to tell the four
kinds apart:

| Kind | Declared | Needs an outer instance? | Can capture locals? | Created with |
|---|---|---|---|---|
| static nested | `static class N` in a class body | no | — | `new Outer.N()` |
| inner (member) | `class I` in a class body | **yes** | — | `outerRef.new I()`, or `new I()` in instance code |
| local | `class L` inside a method/block | yes, if declared in instance code | effectively final locals | `new L()` inside the block |
| anonymous | `new Type(args) { body }` | yes, if declared in instance code | effectively final locals | the expression itself |

A **static nested** class is just a top-level class living in another's namespace: it can access the outer
class's private *static* members, but has no `Outer.this`. An **inner** class is tied to one outer object
and can read its fields directly — use `Outer.this.x` when a closer `x` shadows the field:

```java predict
public class Main {
    private String name = "Main";
    private static int created = 0;

    static class Counter {               // static nested: no Main instance
        int next() { return ++created; }
    }
    class Greeter {                      // inner: bound to a Main instance
        private String name = "Greeter";
        String hello(String name) {
            return name + "/" + this.name + "/" + Main.this.name;
        }
    }
    public static void main(String[] args) {
        Counter c = new Counter();
        c.next(); c.next();
        Main outer = new Main();
        Main.Greeter g = outer.new Greeter();
        System.out.println(created + " " + g.hello("param"));
    }
}
```
```output
2 param/Greeter/Main
```

Three different `name` variables are in scope inside `hello`: the parameter (innermost), the inner class's
field (`this.name`), and the outer object's field (`Main.this.name`).

> [!RULE]
> In instance code of `Main`, `new Greeter()` means `this.new Greeter()`. In **static** code there is no
> `this`, so `new Greeter()` fails with *non-static variable this cannot be referenced from a static
> context*. Writing `new Main.Greeter()` does not help. After `outer.new` you may use only the simple name:
> `outer.new Greeter()`, never `outer.new Main.Greeter()`.

::check D3-OBJ-003

### Local and anonymous classes

A **local class** is declared inside a block and visible only there. An **anonymous class** declares and
instantiates a one-off subclass (or interface implementation) in a single expression; it has no name, so it
cannot declare a constructor, but it can have fields, initializer blocks and extra methods. Both may use
local variables of the enclosing block only if they are `final` or **effectively final** (never assigned
after initialization).

```java predict
public class Main {
    interface Shape { double area(); }
    public static void main(String[] args) {
        int side = 3;
        class Square implements Shape {
            public double area() { return side * side; }
        }
        Shape circle = new Shape() {
            private final double r = 1;
            public double area() { return Math.round(Math.PI * r * r * 100) / 100.0; }
            @Override public String toString() { return "anon circle"; }
        };
        System.out.println(new Square().area() + " " + circle.area() + " " + circle);
        System.out.println(circle.getClass().getName() + " " + Square.class.getName());
    }
}
```
```output
9.0 3.14 anon circle
Main$1 Main$1Square
```

javac names anonymous classes `Outer$1`, `Outer$2`, … and local classes `Outer$1Name`. Change one thing —
assign the captured variable later — and the class no longer compiles:

```java predict
public class Main {
    public static void main(String[] args) {
        int limit = 10;
        Runnable r = new Runnable() {
            public void run() { System.out.println(limit); }
        };
        limit++;
        r.run();
    }
}
```
```output
Compilation fails: local variables referenced from an inner class must be final or effectively final
```

> [!TRAP]
> The effectively-final check covers the **whole scope**, including assignments that come *after* the
> local/anonymous class. The error is reported at the use inside the class, not at `limit++`.

> [!NOTE] Beyond the exam
> Since Java 16, local classes, anonymous classes and inner classes may declare `static` members (and local
> records, enums and interfaces are allowed). Older study material that says "inner classes cannot have
> static members" is out of date.

## The object lifecycle and garbage collection

1. **Creation** — `new` allocates memory, fields get default values, constructors run (see the next
   lesson for the exact order).
2. **In use** — reachable through at least one chain of references starting from a *GC root*: a live
   local variable or parameter, a static field, an active thread.
3. **Eligible** — no chain from any root reaches the object any more. You control this by reassigning
   variables, setting them to `null`, or letting a method return so its locals disappear.
4. **Collected** — at some later point, *if ever*, the garbage collector reclaims the memory. You cannot
   predict or force this.

Counting eligible objects is a pure arrow-drawing exercise. Consider:

```java
Object o1 = new Object();   // #1
Object o2 = new Object();   // #2
Object o3 = o1;             // #1 has two arrows
o1 = o2;                    // #1 still reachable via o3
o2 = null;                  // #2 still reachable via o1
o3 = new Object();          // #3; #1 has lost its last arrow → eligible
```

At the end, exactly one object (#1) is eligible.

**Islands of isolation.** Java does not count references; it checks reachability. Two objects that point
at each other but that no root can reach are both eligible:

```java predict
public class Main {
    static class Node { Node next; String id; Node(String id) { this.id = id; } }
    public static void main(String[] args) {
        Node a = new Node("A");
        Node b = new Node("B");
        a.next = b;
        b.next = a;              // cycle A ⇄ B
        Node keep = b.next;      // keep → A
        a = null;
        b = null;                // B reachable via keep.next, A via keep
        System.out.println(keep.id + keep.next.id);
        keep = null;             // now A ⇄ B is an island: both eligible
        System.gc();             // a request only — nothing to observe
        System.out.println("done");
    }
}
```
```output
AB
done
```

> [!RULE]
> `System.gc()` (and `Runtime.getRuntime().gc()`) only **suggests** a collection. `Object.finalize()` was
> deprecated in Java 9 and is deprecated *for removal* (JEP 421); it may never run, and an object can run it
> at most once. Release resources with try-with-resources (or `java.lang.ref.Cleaner`), never with
> `finalize`.

> [!TRAP]
> - An object referenced only from another **unreachable** object is unreachable too.
> - Strings created from literals live in the string pool and are typically never collected — exam
>   questions about GC use `new` objects for that reason.
> - "Eligible" ≠ "collected". A question asking how many objects *are collected* at a point has no
>   definite answer; one asking how many are *eligible* does.

## What if…? One change at a time

| Change | Result |
|---|---|
| `replace(a)` assigns `acc.balance = 0` instead of `acc = new Account(...)` | the caller sees balance `0` — the shared object is mutated |
| Compare two `StringBuilder("x")` objects with `equals` | `false` — `StringBuilder` does not override `equals` |
| `Inner i = new Inner();` inside an **instance** method of the outer class | compiles: it means `this.new Inner()` |
| Make `Inner` a `static` class and keep `outer.new Inner()` | error: *qualified new of static class* |
| Static nested class reads an outer **instance** field directly | error: *non-static variable … cannot be referenced from a static context* |
| `Main m = null; m.new Inner();` | compiles, throws `NullPointerException` at runtime |
| A local class captures `int n` and `n++` appears anywhere later in the block | does not compile |
| Break an island by keeping one reference to any object in it | the whole cycle is reachable again — nothing eligible |

## Exam traps checklist

> [!TRAP]
> - `a == b` on objects never compares content — even for two records with identical components.
> - A method parameter reassigned inside the method never changes the caller's variable, for any type.
> - `outer.new Inner()` is the only way to create an inner instance from static code; `new Outer.Inner()`
>   works only for **static** nested classes.
> - An anonymous class cannot declare a constructor; it passes arguments to the **superclass** constructor:
>   `new Base(5) { ... }`.
> - For GC counting, list the arrows at the marked line — do not count objects that were never created
>   with `new` (e.g. string literals) unless the question says so.

## Practice

::check D3-OBJ-001

::check D3-OBJ-005

::check D3-OBJ-009

::check D3-OBJ-010
