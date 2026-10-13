---
id: oop-interfaces
domain: D3
order: 7
title: Interfaces, Default Methods & Functional Interfaces
summary: What an interface may contain and which modifiers are implicit, how default, static and private methods behave, how Java resolves conflicting defaults, when to choose an abstract class instead, and what makes an interface functional.
minutes: 45
objectives: [D3.6]
prerequisites: [oop-inheritance-polymorphism]
contract:
  - List every kind of interface member together with its implicit modifiers, and spot illegal ones.
  - Resolve calls to default methods using the class-wins and most-specific rules, and fix a diamond conflict with InterfaceName.super.method().
  - Call static and private interface methods correctly and explain why static interface methods are not inherited.
  - Decide whether an interface is functional, counting inherited methods and ignoring public Object methods.
keyRules:
  - Interface fields are implicitly public static final and must be initialized.
  - Interface methods are implicitly public unless declared private. A method without a body is implicitly abstract.
  - default, static and private methods have bodies. protected, final and package access are not allowed on interface members.
  - Class wins. A method inherited from a superclass beats any interface default with the same signature.
  - Between interface defaults, the most specific one wins (a sub-interface overrides its parent). Two unrelated defaults are a compile error until the class overrides the method; it may call one of them with X.super.m().
  - Static interface methods are not inherited. Call them as InterfaceName.method(), never through an instance or an implementing class.
  - A functional interface has exactly one abstract method. Default, static and private methods and redeclared public Object methods do not count.
retrieval:
  - Write an interface that uses all five method kinds (abstract, default, static, private, private static) and say which can call which.
  - "Explain the two resolution rules for `class C extends B implements I`, where B and I both provide m()."
  - Why does java.util.Comparator count as a functional interface even though it declares equals(Object)?
checks: []
mastery: [D3-IFC-002, D3-IFC-004, D3-IFC-006, D3-IFC-007, D3-IFC-008]
---

## Mental model: a contract, plus optional shared behaviour

A class says *what an object is and holds*. An interface says *what an object can do*. A class has one
superclass but may implement any number of interfaces, so interfaces are how Java gets multiple
inheritance of **type** while avoiding multiple inheritance of **state**: interfaces have no instance fields
and no constructors.

Since Java 8, interfaces may also carry **behaviour** (default and static methods). Since Java 9 they may
have **private helpers**. Behaviour without state is still safe to inherit from several places. Only the
rare case of two identical method signatures needs a rule, and the rules are short.

## What an interface may contain

| Member | Written as | Implicit modifiers | Body? |
|---|---|---|---|
| constant | `int MAX = 10;` | `public static final` | must be initialized (`int MAX;` gives *= expected*) |
| abstract method | `double area();` | `public abstract` | no |
| default method | `default String info() { ... }` | `public` | yes |
| static method | `static Shape unit() { ... }` | `public` | yes |
| private method (Java 9) | `private String fmt(...) { ... }` | (none) | yes |
| private static method (Java 9) | `private static int clamp(...) { ... }` | (none) | yes |
| nested types | `record Point(...) {}` | `public static` | n/a |

Things that do **not** compile in an interface: `protected` or `final` methods (*modifier ... not allowed
here*), a `default` or `static` method without a body (*missing method body*), a `private` method without a
body, instance fields, constructors, and a `default` method that overrides an `Object` method such as
`equals`, `hashCode` or `toString` (*default method equals in interface A overrides a member of
java.lang.Object*).

**Because abstract methods are implicitly `public`, the implementation must be `public` too.** Forgetting
it is the single most common interface compile error:

```java predict
interface Shape { double area(); }
class Square implements Shape {
    private final double side;
    Square(double side) { this.side = side; }
    double area() { return side * side; }
}
public class Main {
    public static void main(String[] args) { System.out.println(new Square(2).area()); }
}
```
```output
Compilation fails: area() in Square cannot implement area() in Shape; attempting to assign weaker access privileges; was public
```

Who may call whom inside the interface:

| From \ To | abstract / default | private | static | private static |
|---|---|---|---|---|
| default or private method | yes | yes | yes | yes |
| static or private static method | **no**, there is no instance | **no** | yes | yes |

::check D3-IFC-005

## Default methods and conflict resolution

A default method gives implementing classes a ready-made implementation they may override.
When the same signature arrives from several places, three rules decide, in order:

1. **Class wins.** A method inherited from the superclass chain (concrete or abstract) takes priority over
   every interface default.
2. **Most specific interface wins.** If interface `B extends A` overrides `A`'s default, `B`'s version is
   used, even if the class also lists `A` directly.
3. **Otherwise the class must override.** Two unrelated defaults are a compile error: *types Walker and
   Swimmer are incompatible; class Duck inherits unrelated defaults for move()*. Inside the override,
   `Walker.super.move()` calls a specific default.

```java predict
interface Walker { default String move() { return "walk"; } }
interface Swimmer { default String move() { return "swim"; } }
class Animal { public String move() { return "animal"; } }
class Robot extends Animal implements Walker, Swimmer { }           // rule 1: class wins
class Duck implements Walker, Swimmer {                              // rule 3: must override
    @Override public String move() { return Walker.super.move() + "+" + Swimmer.super.move(); }
}
public class Main {
    public static void main(String[] args) {
        System.out.println(new Robot().move());
        System.out.println(new Duck().move());
    }
}
```
```output
animal
walk+swim
```

Details that the exam likes:

- `X.super.m()` works only when `X` is a **direct** superinterface of the class or interface where the call
  is written. Naming a grandparent interface gives *not an enclosing class: A*. Plain `super.move()` in `Duck`
  refers to the superclass (`Object`) and does not compile.
- If the inherited class method is **not `public`** (for example package access), "class wins" turns into an
  error: *move() in Animal cannot implement move() in Walker; attempting to assign weaker access privileges*.
- An abstract class method also wins: if the superclass declares `public abstract String move();`, the
  defaults are ignored and the concrete class must implement `move()`.
- A sub-interface may redeclare an inherited default as **abstract** (`String move();`), which forces
  implementers to provide it again.

::check D3-IFC-001

## Static and private interface methods

**Static interface methods are not inherited**, neither by implementing classes nor by sub-interfaces. This
is a deliberate difference from static methods of classes, and it avoids conflicts between two interfaces
that both declare `of(...)`.

```java predict
interface Util {
    static int twice(int x) { return 2 * x; }
    default int quad(int x) { return twice(twice(x)); }   // simple name is fine inside the interface
}
public class Main implements Util {
    public static void main(String[] args) {
        System.out.println(Util.twice(3) + " " + new Main().quad(1));
    }
}
```
```output
6 4
```

Outside the interface, `twice(3)` in `Main` or `Main.twice(3)` gives *cannot find symbol*.
`Util u = ...; u.twice(3)` is not allowed either (*illegal static interface method call*).

**Private methods** (Java 9) remove duplication between defaults without exposing helpers in the API.
A `private` instance method can be called from default and other private instance methods. A
`private static` method can be called from anywhere in the interface.

::check D3-IFC-003

## Interface inheritance and abstract class vs interface

Interfaces `extends` any number of other interfaces (`interface C extends A, B`). Constants with the same name
from two interfaces are fine until used by simple name (*reference to x is ambiguous*); qualify them
(`A.x`).

| | Abstract class | Interface |
|---|---|---|
| instance fields / per-object state | yes | no (constants only) |
| constructors | yes | no |
| how many per class | one (`extends`) | any number (`implements`) |
| method access | any | `public` or `private` |
| non-final methods with bodies | yes | `default` methods |
| `final` methods | yes | no |
| typical use | shared state and partial implementation for closely related classes | capability or contract shared by unrelated classes |

## Functional interfaces

A **functional interface** has **exactly one abstract method** (the *single abstract method*, SAM). It is the
target type for lambdas and method references. The count:

- includes abstract methods **inherited** from super-interfaces;
- excludes `default`, `static` and `private` methods;
- excludes abstract declarations that match a **public method of `Object`** (`equals(Object)`,
  `hashCode()`, `toString()`), because every implementing class already has them. That is how
  `java.util.Comparator` can declare `compare` **and** `equals` and still be functional.

`@FunctionalInterface` is optional, but it asks the compiler to verify the rule (*Unexpected
@FunctionalInterface annotation ... multiple non-overriding abstract methods found* / *no abstract method
found*).

```java predict
@FunctionalInterface
interface Calc {
    int apply(int x);
    boolean equals(Object o);          // does not count
    String toString();                 // does not count
    default Calc twice() { return x -> apply(apply(x)); }
    static Calc identity() { return x -> x; }
}
public class Main {
    public static void main(String[] args) {
        Calc plus3 = x -> x + 3;
        System.out.println(plus3.twice().apply(1) + " " + Calc.identity().apply(9));
    }
}
```
```output
7 9
```

> [!NOTE]
> `Object clone()` is `protected` in `Object`, so an interface that declares `Object clone();` *does* count
> it as its abstract method. Only **public** `Object` methods are excluded.

## What if…? One change at a time

| Change | Result |
|---|---|
| Implementation of an interface method has no `public` | error: weaker access privileges |
| `int MAX;` in an interface | error: `=` expected (constants must be initialized) |
| `MAX = 5;` in an implementing class | error: cannot assign a value to static final variable |
| Superclass provides `public move()` and two interfaces provide default `move()` | compiles: the class method wins |
| Same, but the superclass method has package access | error: weaker access privileges |
| `B extends A`, both have default `hi()`, class implements `A, B` | compiles: B's default (more specific) |
| A static interface method is called via an implementing class name | error: cannot find symbol |
| A static interface method calls a private instance interface method | error: non-static method cannot be referenced from a static context |
| `@FunctionalInterface` interface gains a second abstract method | error: not a functional interface |
| A functional interface redeclares `boolean equals(Object)` | still functional |

## Exam traps checklist

> [!TRAP]
> - **Implicit `public`.** A class that implements an interface method without writing `public` does not compile.
> - **Static interface methods are not inherited.** `Impl.of()` and `instance.of()` fail; only `Iface.of()` works.
> - **Class wins**, but only with a `public` class method; otherwise you get an access error, not the default.
> - Two unrelated defaults compile fine in the interfaces. The error appears in the class that implements both.
> - `X.super.m()` needs `X` to be a direct superinterface; `super.m()` alone targets the superclass.
> - A `default` method may not override `equals`, `hashCode` or `toString`.
> - Inherited abstract methods count toward the single abstract method; public `Object` methods do not.

## Practice

Continue to the mastery quiz, then to enums, which can implement interfaces too.
