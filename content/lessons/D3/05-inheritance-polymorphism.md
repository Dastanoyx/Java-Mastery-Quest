---
id: oop-inheritance-polymorphism
domain: D3
order: 5
title: Inheritance, Overriding, Abstract Classes & Polymorphism
summary: What a subclass really inherits, the exact overriding rules, abstract classes, why the reference type decides what compiles while the object decides what runs, casting, and the Object methods equals, hashCode and toString.
minutes: 55
objectives: [D3.5]
prerequisites: [oop-constructors]
contract:
  - Decide whether an overriding method compiles by checking signature, return type, access, checked exceptions, static/final modifiers and @Override.
  - Predict output when fields, static methods and instance methods with the same names exist in a superclass and a subclass.
  - Separate compile-time questions (the reference type) from runtime questions (the object's class), including casts that compile but throw ClassCastException.
  - Override equals, hashCode and toString correctly and spot the equals(Foo) overloading trap.
keyRules:
  - A class extends exactly one class. It inherits accessible fields and methods, but not private members and never constructors.
  - "Overriding needs the same name and parameter types. The return type may be a subtype (covariant), access may not be narrower, and checked exceptions may not be new or broader."
  - Instance methods are dispatched on the runtime class. Fields and static methods are not dispatched at all; the reference type picks them at compile time (hiding).
  - A private, static or final method is never overridden. Private and static methods can be redeclared (a new or hiding method); final ones cannot be redeclared at all.
  - An abstract class cannot be instantiated. Its first concrete subclass must implement every inherited abstract method. abstract cannot be combined with final, private or static on a method.
  - A cast compiles if the two types could be related. If the object turns out to be the wrong class, the JVM throws ClassCastException at runtime. A cast between provably unrelated types is a compile error.
  - equals must take Object. Equal objects must have equal hash codes, and the default toString is ClassName@hexHashCode.
retrieval:
  - List the six checks the compiler makes on an overriding method.
  - "For `Parent p = new Child();` with a field `name` and a static method `id()` declared in both classes, say which version `p.name`, `p.id()` and `p.toString()` use, and why."
  - Write a correct equals/hashCode pair for a class with two int fields, from memory.
  - Give one cast that fails to compile and one that compiles but throws ClassCastException.
checks: []
mastery: [D3-INH-005, D3-INH-006, D3-INH-007, D3-INH-008]
---

## Mental model: two types for every expression

Every object-oriented question on the exam comes down to keeping **two types** apart:

- the **reference type** (the declared type of the variable or expression) is what the **compiler**
  knows. It decides which members you may name, which overload is chosen, which checked exceptions you
  must handle, and which field or static method is used.
- the **runtime type** (the class the object was created from with `new`) is what the **JVM** knows.
  It decides one thing: which **overriding instance method** actually runs.

```java
Animal a = new Dog();   // reference type Animal, runtime type Dog
a.sound();              // compiler: does Animal have sound()? yes, so it compiles. JVM: Dog's sound() runs.
a.fetch();              // compiler: Animal has no fetch(), so this does not compile, although the object could fetch
```

Inheritance (`class Dog extends Animal`) gives `Dog` all *accessible* members of `Animal` and lets a
`Dog` be used wherever an `Animal` is expected. Java has **single inheritance of classes**: one
`extends`, ever (`class C extends A, B` is a syntax error). A class without `extends` implicitly extends
`java.lang.Object`.

What is **not** inherited:

| Member | Inherited? |
|---|---|
| `public` / `protected` fields and methods | yes |
| package-private members | only by subclasses in the same package |
| `private` fields and methods | **no**. The superclass part of the object still holds the field, but the subclass cannot name it (*secret has private access in Parent*) |
| constructors | **never**. They are not members (see *Constructors*) |
| `static` members | reachable through the subclass name, but hidden rather than overridden |

## Overriding: the exact compile-time rules

A subclass method **overrides** a superclass instance method when it has the **same name and the same
parameter types**. The compiler then checks all of the following:

| Rule | Violation produces |
|---|---|
| Return type is the same or, for reference types, a **subtype** (covariant return). Primitive return types must be identical | *return type long is not compatible with int* |
| Access is the same or **wider** (`private` < package < `protected` < `public`) | *attempting to assign weaker access privileges; was protected* |
| Checked exceptions: none new, none broader. Fewer, narrower or unchecked exceptions are fine | *overridden method does not throw java.lang.Exception* |
| The superclass method is not `final` | *overridden method is final* |
| Both methods are instance methods. A static method cannot replace an instance method, and an instance method cannot replace a static one | *overriding method is static* / *overridden method is static* |
| If you write `@Override`, there must really be something to override | *method does not override or implement a method from a supertype* |

Different parameter types are **not** an error: they create an *overload*. That is exactly why
`@Override` exists. `@Override void m(long x)` where the parent has `m(int)` is rejected. Without the
annotation it silently compiles as a second method.

**Private methods are invisible to subclasses**, so a subclass method with the same signature is a new
method. A call made *inside the superclass* to its own private method is bound at compile time:

```java predict
class Parent {
    private String tag() { return "P"; }
    String who() { return "p"; }
    String show() { return tag() + who(); }
}
class Child extends Parent {
    String tag() { return "C"; }            // a new method, not an override
    @Override String who() { return "c"; }  // a real override
}
public class Main {
    public static void main(String[] args) {
        System.out.println(new Child().show());
    }
}
```
```output
Pc
```

**`super.method()`** calls the superclass version from the subclass. Only that one call skips dynamic
dispatch: any overridable method the superclass code calls in turn is dispatched on the runtime class
again.

```java predict
class A {
    String who() { return "A"; }
    String hi() { return "hi " + who(); }
}
class B extends A {
    @Override String who() { return "B"; }
    @Override String hi() { return super.hi() + "!"; }
}
class C extends B {
    @Override String who() { return "C"; }
}
public class Main {
    public static void main(String[] args) {
        A x = new C();
        System.out.println(x.hi());
    }
}
```
```output
hi C!
```

`x.hi()` runs `B.hi()` (C inherits it), which runs `A.hi()` through `super`. Inside `A.hi()`, `who()` is
still a virtual call on a `C` object, so it returns `C`.

> [!RULE]
> Checked exceptions follow the **reference type**. If `Reader.open()` declares `throws Exception` and
> `SafeReader.open()` declares nothing, then `Reader r = new SafeReader(); r.open();` must still handle
> `Exception`, because the compiler only sees `Reader`.

::check D3-INH-001

## Hiding: fields and static methods are not polymorphic

A field with the same name in a subclass **hides** the parent's field: the object now has *two* fields.
Which one an expression reads depends on the **reference type**. Static methods work the same way.
Calling a static method through an instance reference is legal but misleading, because the compiler
uses only the reference's declared type.

```java predict
class Animal {
    String name = "animal";
    static String kind() { return "Animal.kind"; }
    String sound() { return "..."; }
    String describe() { return name + " says " + sound(); }
}
class Dog extends Animal {
    String name = "dog";
    static String kind() { return "Dog.kind"; }
    @Override String sound() { return "woof"; }
}
public class Main {
    public static void main(String[] args) {
        Animal a = new Dog();
        System.out.println(a.name);
        System.out.println(a.sound());
        System.out.println(a.kind());
        System.out.println(((Dog) a).name);
        System.out.println(a.describe());
    }
}
```
```output
animal
woof
Animal.kind
dog
animal says woof
```

The last line is the subtle one. Inside `Animal.describe()`, `name` means `this.name` with `this` typed as
`Animal`, so it reads Animal's field. `sound()` is an instance method and dispatches to `Dog`.

::check D3-INH-002

## Abstract classes and methods

An `abstract` class is a partial implementation. It may have fields, constructors, concrete methods and
**abstract methods** (a signature ending in `;` with no body).

- `new Shape()` on an abstract class does not compile: *Shape is abstract; cannot be instantiated*.
  An anonymous subclass (`new Shape() { ... }`) is fine.
- Its constructors still run, as part of constructing a concrete subclass, through `super(...)`.
- The **first concrete subclass** must implement every abstract method it inherits. Abstract subclasses
  may pass the obligation on. Otherwise: *Sq is not abstract and does not override abstract method area() in Shape*.
- A class that declares an abstract method must itself be declared `abstract`.
- Illegal on a method: `abstract final`, `abstract private`, `abstract static` (each reported as
  *illegal combination of modifiers*), and an abstract method with a body (*abstract methods cannot have
  a body*). `abstract final class` is illegal as well.

```java predict
abstract class Account {
    private final String id;
    protected Account(String id) { this.id = id; System.out.print("Account "); }
    abstract double fee();
    @Override public String toString() { return id + ":" + fee(); }
}
class Basic extends Account {
    Basic() { super("B1"); System.out.print("Basic "); }
    @Override double fee() { return 1.5; }
}
public class Main {
    public static void main(String[] args) {
        System.out.println(new Basic());
    }
}
```
```output
Account Basic B1:1.5
```

::check D3-INH-003

## Casting and instanceof

**Upcasting** (subclass to superclass or interface) is always safe and implicit: `Animal a = new Dog();`.
**Downcasting** needs an explicit cast and is checked **twice**:

1. **Compile time**: could an object of the expression's type possibly be of the target type? If the
   types are provably unrelated (two sibling classes, `String` to `Integer`, a `final` class that does
   not implement the interface), the cast does not compile: *incompatible types: B cannot be converted
   to C*. A cast from a non-final class to an interface always compiles, because some subclass might
   implement it.
2. **Runtime**: the JVM checks the actual object. Wrong class means `ClassCastException`.

```java predict
class A { }
class B extends A { }
class C extends A { }
public class Main {
    public static void main(String[] args) {
        A x = new B();
        B b = (B) x;
        System.out.println("cast to B ok");
        C c = (C) x;
        System.out.println("unreachable");
    }
}
```
```output
cast to B ok
Exception in thread "main" java.lang.ClassCastException: class B cannot be cast to class C (B and C are in unnamed module of loader 'app')
```

`instanceof` performs the same compile-time check (with a final class `Stone` that does not implement
`Flyer`, `stone instanceof Flyer` does not compile) and returns `false` for `null`. The pattern form
`x instanceof C c` combines the test and the cast. It is covered in *Sealed types & pattern matching*.

::check D3-INH-004

## Object methods: equals, hashCode, toString

Every class inherits from `Object`:

| Method | Default behaviour | Contract when you override |
|---|---|---|
| `boolean equals(Object o)` | identity (`this == o`) | reflexive, symmetric, transitive, consistent; `x.equals(null)` is `false` |
| `int hashCode()` | identity-based number | **equal objects must have equal hash codes**; unequal objects may collide |
| `String toString()` | `getClass().getName() + "@" + Integer.toHexString(hashCode())` | a human-readable description |

The classic trap is writing `equals(Point p)`. It **overloads** instead of overriding, because the
parameter type differs. Collections call `equals(Object)`, so they never see your method:

```java predict
import java.util.*;
class Point {
    final int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }
    public boolean equals(Point p) { return p != null && x == p.x && y == p.y; }
    @Override public int hashCode() { return 31 * x + y; }
}
public class Main {
    public static void main(String[] args) {
        Point a = new Point(1, 2), b = new Point(1, 2);
        Object o = b;
        System.out.println(a.equals(b));
        System.out.println(a.equals(o));
        System.out.println(List.of(a).contains(b));
    }
}
```
```output
true
false
false
```

`a.equals(b)` picks the overload `equals(Point)` at compile time. `a.equals(o)` has an `Object` argument,
so it picks the inherited `Object.equals(Object)`, which compares identity. `@Override` on `equals(Point)`
would have turned the mistake into a compile error. A correct version:

```java
@Override public boolean equals(Object o) {
    return o instanceof Point p && x == p.x && y == p.y;   // instanceof is false for null
}
@Override public int hashCode() { return Objects.hash(x, y); }
```

> [!TIP]
> Records generate `equals`, `hashCode` and `toString` from their components (`Point[x=1, y=2]`). That is
> one reason they are the default choice for value types.

## What if…? One change at a time

| Change | Result |
|---|---|
| Overriding method goes from `protected` to package access | compile error: weaker access privileges |
| Parent returns `Object`, child returns `String` | compiles (covariant return) |
| Parent returns `int`, child returns `long` | compile error: return type not compatible |
| Parent `throws IOException`, child `throws FileNotFoundException, IllegalStateException` | compiles: a narrower checked exception plus an unchecked one |
| Parent method is `static`, child redeclares it without `static` | compile error: *overridden method is static* |
| Parent method is `private`, child adds `@Override` | compile error: nothing to override |
| Concrete class declares `abstract void m();` | compile error: the class is not abstract and does not override abstract method m() |
| `(C) b` where `B b` and `C` is a sibling class | compile error: incompatible types |
| `(C) a` where `A a = new B()` | compiles, `ClassCastException` at runtime |
| `equals(Point)` instead of `equals(Object)`, plus `@Override` | compile error, which catches the overloading bug |

## Exam traps checklist

> [!TRAP]
> - **Fields and static methods are not overridden.** `p.name` and `p.staticMethod()` follow the declared type of `p`, even when the object is a subclass.
> - A method that **looks** like an override but has different parameter types is an overload. Look for `@Override`; without it both methods compile.
> - `super.m()` only fixes the *first* call. Calls made inside `m()` dispatch on the runtime object again.
> - The reference type decides which **checked exceptions** must be handled, even if the runtime override declares none.
> - A cast that compiles can still throw `ClassCastException`. A cast between unrelated class types never compiles.
> - Calling a superclass `private` method from superclass code ignores a same-named method in the subclass.
> - `abstract` together with `final`, `private` or `static` on a method never compiles.

## Practice

Try the mastery quiz once the four checks above feel easy. Then continue to sealed hierarchies and
pattern matching, which build directly on the reference type vs runtime type split.
