---
id: oop-enums
domain: D3
order: 8
title: Enums with Fields, Constructors and Methods
summary: Enums as a fixed set of singleton objects, with values, valueOf, ordinal and compareTo, switching on enums, fields and implicitly private constructors, constant-specific bodies, interfaces, EnumMap and EnumSet, and exactly when the constants are constructed.
minutes: 40
objectives: [D3.7]
prerequisites: [oop-inheritance-polymorphism]
contract:
  - Use values(), valueOf(), ordinal(), name() and compareTo() and predict their results and exceptions.
  - Write enum switches, both statement and expression forms, with unqualified or (Java 21+) qualified constants.
  - Add fields, constructors and methods to an enum, including constant-specific bodies and interface implementations.
  - Trace when enum constructors run, and explain why a constructor may not touch a non-constant static field.
keyRules:
  - "Each enum constant is a public static final instance of the enum, created once when the enum class is initialized. Compare constants with ==."
  - values() returns a new array in declaration order. valueOf(String) needs the exact name and throws IllegalArgumentException otherwise (NullPointerException for null).
  - ordinal() is zero-based. compareTo() orders by ordinal. name(), equals(), hashCode() and compareTo() are final, while toString() may be overridden.
  - Enum constructors are implicitly private, cannot be invoked with new and cannot call super(...).
  - The constant list must come first in the enum body and must end with a semicolon if any other member follows.
  - If the enum declares an abstract method, every constant must provide a class body that implements it.
  - Enum constructors and instance initializers may not refer to the enum's non-constant static fields.
retrieval:
  - Write an enum with a field, a constructor, a getter and one constant-specific method body, from memory.
  - What exactly does `Size.valueOf("small")` do when the constant is declared as SMALL?
  - "In what order do these run: the enum's static block, the constants' constructors, and main()'s first statement that touches the enum?"
checks: []
mastery: [D3-ENM-001, D3-ENM-003, D3-ENM-004, D3-ENM-007]
---

## Mental model: a class with a fixed guest list

An enum is a **class whose instances are all listed up front**. `enum Size { S, M, L }` compiles to roughly:

```java
final class Size extends java.lang.Enum<Size> {          // implicitly final (unless constants have bodies)
    public static final Size S = new Size("S", 0);
    public static final Size M = new Size("M", 1);
    public static final Size L = new Size("L", 2);
    private Size(String name, int ordinal) { super(name, ordinal); }
    // + static values(), static valueOf(String)
}
```

Consequences you can derive from that picture:

- There is **exactly one object per constant**, so `==` is the right comparison (and it is null-safe).
- Nobody can create more: constructors are private, `new Size()` gives *enum classes may not be
  instantiated*, and a class cannot extend an enum (*cannot inherit from final Size*, *enum classes are not
  extensible*). An enum cannot `extends` anything either, because it already extends `Enum`.
- The constants are **static fields**, so they are created during **class initialization**, which happens
  once at first active use.
- An enum **can implement interfaces** and have fields, methods and constructors like any class.

## The built-in API

| Method | Result | Notes |
|---|---|---|
| `Size.values()` | `Size[]` in declaration order | a **new array** on every call |
| `Size.valueOf("M")` | `Size.M` | exact, case-sensitive name; otherwise `IllegalArgumentException: No enum constant Size.m`; `null` gives `NullPointerException` |
| `M.name()` | `"M"` | final, always the declared identifier |
| `M.toString()` | `"M"` by default | **may be overridden**, and `valueOf` ignores it |
| `M.ordinal()` | `1` | zero-based position |
| `M.compareTo(L)` | negative | compares ordinals (the JDK returns the difference); `Enum` implements `Comparable` |
| `M.equals(x)`, `hashCode()` | identity | final, cannot be overridden |

Relational operators do not work on enums: `s < Size.L` gives *bad operand types for binary operator '<'*.
Use `compareTo`.

```java predict
enum Size {
    SMALL, LARGE;
    @Override public String toString() { return name().toLowerCase(); }
}
public class Main {
    public static void main(String[] args) {
        System.out.println(Size.LARGE + " " + Size.LARGE.name() + " " + Size.LARGE.ordinal());
        System.out.println(Size.valueOf("LARGE") == Size.LARGE);
        System.out.println(Size.valueOf("large"));
    }
}
```
```output
large LARGE 1
true
Exception in thread "main" java.lang.IllegalArgumentException: No enum constant Size.large
```

::check D3-ENM-005

## Enums in switch

Enum switches traditionally use the **unqualified** constant name as the label: `case M:`. Since **Java 21**
the qualified form `case Size.M` is also allowed, and the two may be mixed. A misspelled constant gives
*cannot find symbol*.

```java predict
enum Size { S, M, L }
public class Main {
    static String label(Size s) {
        return switch (s) {          // exhaustive: all three constants, no default needed
            case S -> "small";
            case Size.M -> "medium";
            case L -> "large";
        };
    }
    public static void main(String[] args) {
        System.out.println(label(Size.M));
        switch (Size.S) {            // old-style statement: falls through, needn't be exhaustive
            case S: System.out.print("S");
            case M: System.out.print("M");
                break;
            case L: System.out.print("L");
        }
        System.out.println();
    }
}
```
```output
medium
SM
```

- A switch **expression** over an enum must be exhaustive: either all constants or a `default`
  (otherwise *the switch expression does not cover all possible input values*).
- A `null` selector throws `NullPointerException` unless there is a `case null`.

::check D3-ENM-002

## Fields, constructors and methods

Anything after the constant list (fields, constructors, methods, nested types) needs a **semicolon after the
last constant**. The constants must always come **first** in the body (`enum Size { int x; S, M }` gives
*enum constant expected here*).

```java predict
enum Light {
    RED(30), GREEN(25), YELLOW;          // YELLOW uses the no-arg constructor
    private final int seconds;
    Light() { this(5); }                 // implicitly private; this(...) is fine
    Light(int seconds) { this.seconds = seconds; }
    int seconds() { return seconds; }
    Light next() { return values()[(ordinal() + 1) % values().length]; }
}
public class Main {
    public static void main(String[] args) {
        System.out.println(Light.YELLOW.seconds() + " " + Light.RED.next() + " " + Light.YELLOW.next());
    }
}
```
```output
5 GREEN RED
```

Constructor rules: an explicit `private` modifier is allowed, but `public` or `protected` gives *modifier
public not allowed here*. `super(...)` gives *call to super not allowed in enum constructor*.

> [!TIP]
> Enum fields are usually `final`, but the language does not require it. A mutable field on a constant is
> effectively global mutable state shared by the whole program, which is a design smell and an exam
> distractor.

## Constant-specific bodies and interfaces

A constant may have its **own class body**, which creates an anonymous subclass for that constant. The
usual purpose is to implement an `abstract` method declared by the enum, so that **every** constant is forced
to provide it (a constant without a body gives *Op is abstract; cannot be instantiated*):

```java predict
interface Pricing { double apply(double base); }
enum Op implements Pricing {
    FULL     { public double apply(double b) { return b; } },
    HALF     { public double apply(double b) { return b / 2; } },
    DISCOUNT { public double apply(double b) { return b - discount(); } };

    double discount() { return 3; }
}
public class Main {
    public static void main(String[] args) {
        for (Op op : Op.values()) System.out.print(op + "=" + op.apply(10) + " ");
        System.out.println();
        System.out.println(Op.HALF.getClass() == Op.class);
        System.out.println(Op.HALF.getDeclaringClass() == Op.class);
    }
}
```
```output
FULL=10.0 HALF=5.0 DISCOUNT=7.0 
false
true
```

The enum implements `Pricing` without implementing `apply` itself, so each constant must supply it. A
constant with a body is an instance of an anonymous subclass, so `getClass()` is not `Op.class`;
`getDeclaringClass()` always returns the enum type.

## When are the constants built? Static restrictions

The constants are the first static fields of the enum, so on first active use the JVM runs:
**every constant's constructor, in declaration order → the remaining static field initializers and static
blocks, in textual order**. Creating an array of the enum type does not initialize it.

```java predict
enum Level {
    LOW("l"), HIGH("h");
    private final String code;
    Level(String code) { this.code = code; System.out.print("ctor-" + code + " "); }
    static { System.out.print("static "); }
}
public class Main {
    public static void main(String[] args) {
        System.out.print("start ");
        Level x = Level.HIGH;
        System.out.print("got " + x + " ");
        Level y = Level.LOW;
        System.out.println("end");
    }
}
```
```output
start ctor-l ctor-h static got HIGH end
```

Because the constructors run **before** other static fields are initialized, the compiler forbids enum
constructors, instance initializers and instance field initializers from referring to the enum's static
fields: *illegal reference to static field from initializer*. The exception is **constant variables**
(`static final int MAX = 3;`, `static final String P = "x";`), whose values are inlined at compile time.

```java predict
enum Status {
    ACTIVE, INACTIVE;
    private static int created = 0;
    Status() { created++; }
}
public class Main {
    public static void main(String[] args) { System.out.println(Status.ACTIVE); }
}
```
```output
Compilation fails: illegal reference to static field from initializer
```

## EnumMap and EnumSet

`EnumMap<K, V>` and `EnumSet<E>` are specialised, very fast collections for enum keys and elements. Both
**iterate in ordinal order**, regardless of insertion order.

```java
Map<Day, Integer> hours = new EnumMap<>(Day.class);   // needs the Class object; null keys throw NPE
EnumSet<Day> weekend = EnumSet.of(Day.SAT, Day.SUN);
EnumSet<Day> mid = EnumSet.range(Day.TUE, Day.THU);   // inclusive: TUE, WED, THU
EnumSet<Day> work = EnumSet.complementOf(weekend);
EnumSet<Day> none = EnumSet.noneOf(Day.class), all = EnumSet.allOf(Day.class);
```

::check D3-ENM-006

## What if…? One change at a time

| Change | Result |
|---|---|
| `new Size()` anywhere | error: enum classes may not be instantiated |
| `public Size() {}` | error: modifier public not allowed here |
| Remove the semicolon after the last constant when a field follows | compile error (syntax) |
| `Size.valueOf("m")` for constant `M` | `IllegalArgumentException` at runtime |
| `case Size.M:` in an enum switch | compiles since Java 21 |
| Switch expression covers only two of three constants, no default | error: does not cover all possible input values |
| Enum declares `abstract int f();` and one constant has no body | error: Op is abstract; cannot be instantiated |
| Constructor increments `static int count` | error: illegal reference to static field from initializer |
| Same with `static final int MAX = 3` (constant variable) read in the constructor | compiles |
| Override `equals` in an enum | error: `equals` is final in `Enum` |

## Exam traps checklist

> [!TRAP]
> - `valueOf` uses `name()`, never an overridden `toString()`, and it is case-sensitive.
> - `ordinal()` starts at **0**; `compareTo` returns a negative, zero or positive number based on ordinals (not alphabetical order).
> - Enum constructors run once per constant, all of them at class initialization, **before** the enum's static blocks.
> - Old-style `case X:` labels in an enum switch fall through; arrow labels do not.
> - Enum constructors cannot be `public`, cannot be called with `new` and cannot call `super(...)`.
> - A constant with a class body is an anonymous subclass: `getClass()` differs, `getDeclaringClass()` does not.

## Practice

Finish with the mastery quiz. The sealed shape exercise from the previous lesson is a good place to try an
enum as one of the permitted subtypes, because enums are implicitly final.
