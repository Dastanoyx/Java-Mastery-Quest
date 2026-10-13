---
id: oop-sealed-patterns
domain: D3
order: 6
title: Sealed Types, Records & Pattern Matching
summary: Closed hierarchies with sealed classes and interfaces, records as their natural leaves, and the pattern-matching toolkit built on them, from instanceof patterns and flow scoping to exhaustive switches, guards, dominance and nested record patterns.
minutes: 55
objectives: [D3.5]
prerequisites: [oop-inheritance-polymorphism]
contract:
  - Declare a sealed hierarchy correctly, choosing final, sealed or non-sealed for every permitted subtype, and explain the file, package and module placement rules.
  - Determine where a pattern variable is in scope (flow scoping) in if, &&, || and early-return code.
  - Decide whether a pattern switch compiles by checking exhaustiveness, dominance and guards, and predict what it does with null.
  - Deconstruct records with nested record patterns, var and the unnamed pattern _.
keyRules:
  - "A sealed class or interface lists its direct subtypes with permits. The clause may be omitted only when every subtype is declared in the same file."
  - Every permitted subtype must directly extend or implement the sealed type and be final, sealed or non-sealed. Records and enums are implicitly final.
  - Permitted subtypes must be in the same module as the sealed type, or, in the unnamed module (plain classpath), in the same package.
  - "A pattern variable is in scope only where the match has definitely succeeded: right of &&, the then-branch, and after if (!(x instanceof T t)) return;."
  - A switch over a sealed type is exhaustive without default when unguarded cases cover every permitted subtype. Guarded cases never count toward exhaustiveness.
  - A case is a compile error if an earlier unguarded pattern already matches everything it could match (dominance).
  - A switch throws NullPointerException for a null selector unless it has case null. default does not match null.
retrieval:
  - Name the three modifiers a permitted subclass may use and what each one means for the next level down.
  - Write a sealed interface with two record implementations and an exhaustive switch expression over it, with no default.
  - Explain why two guarded cases that together cover every value still leave a switch non-exhaustive.
  - Rewrite a cascade of instanceof checks and casts as a single switch with record patterns.
checks: []
mastery: [D3-PAT-004, D3-PAT-005, D3-PAT-006, D3-PAT-008]
---

## Mental model: a closed set of shapes

Ordinary inheritance is **open**: anybody can add a subclass later. That is good for frameworks and bad for
reasoning. If you write `if (s instanceof Circle) ... else if (s instanceof Square) ...`, the compiler cannot
know whether you have forgotten a case.

A **sealed** type turns the hierarchy into a **closed list** that the compiler knows. Combined with
**records** (transparent data carriers) and **pattern matching** (test, cast and extract in one step), you get
algebraic data types: "a `Shape` is *either* a `Circle(r)` *or* a `Square(side)`, nothing else". The compiler
can then check that a `switch` handles every alternative.

```java
sealed interface Shape permits Circle, Square {}
record Circle(double r) implements Shape {}
record Square(double side) implements Shape {}
```

Three ideas fit together:

| Idea | Question it answers |
|---|---|
| sealed + permits | *Which* subtypes can exist? |
| records | *What data* does each subtype carry? |
| patterns | *Which case is this, and what is inside it?* |

## Sealed classes and interfaces: the rules

```java
public sealed class Vehicle permits Car, Truck { }
final class Car extends Vehicle { }                     // stops the hierarchy here
sealed class Truck extends Vehicle permits Pickup { }   // keeps it closed one level down
final class Pickup extends Truck { }
```

1. **`permits` lists the direct subtypes.** When all of them are declared in the **same source file** as the
   sealed type, `permits` may be omitted and the compiler infers it from the file.
2. **Each permitted subtype must directly extend or implement the sealed type** (otherwise: *invalid permits
   clause (class Square must extend sealed class)*). A class that is not listed but extends the sealed type is
   rejected: *class is not allowed to extend sealed class: Vehicle (as it is not listed in its 'permits' clause)*.
3. **Each permitted subtype must declare exactly one of**:
   - `final`: no further subclasses;
   - `sealed`: its own closed list (it must then have at least one subclass, or *sealed class must have subclasses*);
   - `non-sealed`: open again; anybody may extend it.

   Missing all three gives *sealed, non-sealed or final modifiers expected*. **Records and enums are
   implicitly `final`**, which makes them ideal leaves. A record cannot `extends` a class (its superclass is
   always `java.lang.Record`), so records join sealed *interfaces*.
4. **Placement.** The sealed type and its permitted subtypes must be in the **same module**. If the code
   lives in the unnamed module (the plain classpath, as in most exam snippets), they must be in the **same
   package**: javac reports *class shapes.Shape in unnamed module cannot extend a sealed class in a different
   package*. The reason is that the whole hierarchy must be compiled and maintained together.
5. **Anonymous and local classes can never extend a sealed type** (*anonymous classes must not extend
   sealed classes*). Lambdas cannot implement a sealed interface either.

> [!NOTE]
> `non-sealed` re-opens only *that* branch. `Pickup extends Truck` with a `non-sealed Truck` is still a
> `Vehicle`, and a switch over `Vehicle` stays exhaustive because `case Truck t` covers all of Truck's
> unknown subclasses.

::check D3-PAT-001

## Pattern matching for instanceof and flow scoping

`o instanceof String s` tests the type, casts and binds `s` in one step. The interesting part is **where `s`
exists**: exactly where the compiler can prove the test succeeded.

```java predict
public class Main {
    static void check(Object o) {
        if (o instanceof Integer i && i > 40) System.out.println("big " + (i + 1));
        if (!(o instanceof Integer n)) {
            System.out.println("not an int");
            return;
        }
        System.out.println("n=" + n);   // in scope: we only get here if the match succeeded
    }
    public static void main(String[] args) {
        check(42);
        check("x");
    }
}
```
```output
big 43
n=42
not an int
```

| Code | Is the pattern variable in scope? |
|---|---|
| `x instanceof T t && t.m()` | yes, `&&` evaluates the right side only after a match |
| `x instanceof T t \|\| t.m()` | **no**, the right side runs only after a *failed* match (*cannot find symbol*) |
| `if (x instanceof T t) { A } else { B }` | in A, not in B |
| `if (!(x instanceof T t)) { return; } C` | in C, because the if-statement cannot complete normally on a failed match |
| `if (!(x instanceof T t)) { log(); } C` | not in C, because control reaches C after a failed match too |

More rules:

- A pattern variable may not have the same name as a local variable already in scope (*variable s is already
  defined*), but it may be reassigned. It is not implicitly final.
- If the expression's type can never be the pattern type, it does not compile (`Integer n; n instanceof String s`
  gives *incompatible types*).
- Since Java 21 the pattern may also be a supertype of the expression's type (`String str; str instanceof
  CharSequence cs`), which always matches non-null values.

::check D3-PAT-002

## Switch with type patterns: exhaustiveness, guards, dominance

A `switch` can match on types. Over a sealed type, the compiler knows every alternative, so a switch
expression needs **no `default`**:

```java predict
sealed interface Shape permits Circle, Rect {}
record Circle(double r) implements Shape {}
record Rect(double w, double h) implements Shape {}
public class Main {
    static String label(Shape s) {
        return switch (s) {
            case Circle c when c.r() == 0 -> "dot";
            case Circle c -> "circle";
            case Rect(double w, double h) when w == h -> "square";
            case Rect r -> "rect";
        };
    }
    public static void main(String[] args) {
        System.out.println(label(new Rect(2, 2)) + " " + label(new Circle(0)) + " " + label(new Rect(1, 3)));
    }
}
```
```output
square dot rect
```

The rules the compiler checks:

1. **Exhaustiveness.** A switch *expression*, and any switch *statement* that uses patterns or `case null`,
   must cover every possible value. Otherwise: *the switch expression does not cover all possible input
   values*. Over a sealed type, unguarded cases for every permitted subtype are enough. A `default` is also
   allowed and simply makes the switch exhaustive.
2. **Guards** (`case T t when condition`) refine a pattern. The compiler does **not** analyse guard
   conditions, so guarded cases **never count toward exhaustiveness**. `when r > 10` plus `when r <= 10` still
   leaves `Circle` uncovered.
3. **Dominance.** A case is unreachable, and therefore an error, if an earlier **unguarded** pattern matches
   everything it could match: `case CharSequence cs` before `case String s`, or `case Integer i` before
   `case Integer i when i > 10`, gives *this case label is dominated by a preceding case label*. A guarded case
   does not dominate a later case of the same type. Put specific cases first, general ones last. A
   `default` placed before a pattern case also dominates it.
4. **No fall-through into patterns.** In the colon form, falling from one pattern case into another gives
   *illegal fall-through to a pattern*. Pattern variables would not be bound.
5. A case label with several patterns may not bind named variables: `case Integer i, String s` does not
   compile, but `case Integer _, String _` does (unnamed patterns, see below).

::check D3-PAT-007

### null

A switch has always thrown `NullPointerException` for a `null` selector, and pattern switches keep that
behaviour. **Neither type patterns nor `default` match `null`.** Opt in with `case null`, alone or combined
as `case null, default ->`:

```java predict
sealed interface Shape permits Circle, Square {}
record Circle(double r) implements Shape {}
record Square(double side) implements Shape {}
public class Main {
    static String f(Shape s) {
        return switch (s) {
            case null -> "nothing";
            case Circle c -> "circle";
            case Square q -> "square";
        };
    }
    static String g(Shape s) {
        return switch (s) {
            case Circle c -> "circle";
            case Square q -> "square";
        };
    }
    public static void main(String[] args) {
        System.out.println(f(null));
        System.out.println(g(new Square(1)));
        System.out.println(g(null));
    }
}
```
```output
nothing
square
Exception in thread "main" java.lang.NullPointerException
```

## Record patterns: deconstruction, nesting, var and _

A **record pattern** `Point(int x, int y)` matches a `Point` and binds its components by calling the
accessors. Record patterns **nest**, and each component pattern can be a type pattern, `var`, another record
pattern, or `_`:

```java predict
record Point(int x, int y) {}
record Line(Point from, Point to) {}
public class Main {
    static String f(Object o) {
        return switch (o) {
            case Line(Point(var x1, var y1), Point(int x2, int y2)) when x1 == x2 -> "vertical " + (y2 - y1);
            case Line(Point p, _) -> "from " + p;
            default -> "?";
        };
    }
    public static void main(String[] args) {
        System.out.println(f(new Line(new Point(1, 1), new Point(1, 5))));
        System.out.println(f(new Line(new Point(0, 0), new Point(2, 5))));
    }
}
```
```output
vertical 4
from Point[x=0, y=0]
```

Rules worth memorising:

- The number of nested patterns must match the number of components (*incorrect number of nested patterns*).
- `var x` infers the component's declared type. It is only allowed for components, never as the outer record
  pattern.
- A nested *type* pattern must be applicable to the component type. When it matches the component type
  exactly (or is a supertype), it also matches `null` components. A narrower type pattern does not match
  `null`.
- A record pattern itself never matches `null`.

```java predict
record Box(Object content) {}
public class Main {
    static String f(Object o) {
        return switch (o) {
            case Box(String s) -> "S:" + s;
            case Box(Object x) -> "O:" + x;
            default -> "none";
        };
    }
    public static void main(String[] args) {
        System.out.println(f(new Box("a")) + " " + f(new Box(null)) + " " + f(42));
    }
}
```
```output
S:a O:null none
```

`Box(String s)` does not match a `null` content because the pattern is narrower than `Object`, but
`Box(Object x)` is total on the component type, so it matches and binds `x = null`.

> [!J25]
> **Unnamed patterns and variables `_`** (JEP 456, final since Java 22) are part of the Java 25 exam. Use `_`
> for a component you do not need (`Line(Point p, _)`), as a whole type pattern (`case Segment _`), or to put
> several patterns in one case (`case Integer _, String _ ->`).

> [!NOTE] Beyond the exam
> Primitive type patterns such as `Point(long x, int y)` or `case int i` are a **preview** feature in
> Java 25 (JEP 507). Without `--enable-preview` javac reports *primitive patterns are a preview feature*. The
> exam's record-pattern questions use the exact component type, `var`, a reference type, or `_`.

### Generic sealed types (intro)

Sealed interfaces may be generic. Record patterns can infer type arguments, so `case Ok(var v)` works
without writing `Ok<T>`:

```java predict
sealed interface Result<T> permits Ok, Err {}
record Ok<T>(T value) implements Result<T> {}
record Err<T>(String msg) implements Result<T> {}
public class Main {
    static String show(Result<Integer> r) {
        return switch (r) {
            case Ok(Integer v) when v > 0 -> "pos";
            case Ok(var v) -> "nonpos " + v;
            case Err(_) -> "err";
        };
    }
    public static void main(String[] args) {
        System.out.println(show(new Ok<>(-1)) + ", " + show(new Ok<>(3)) + ", " + show(new Err<>("x")));
    }
}
```
```output
nonpos -1, pos, err
```

::check D3-PAT-003

## What if…? One change at a time

| Change | Result |
|---|---|
| Remove `final` from `record Circle ... implements Shape` | still compiles: records are implicitly final |
| Remove `final` from `class Cash implements Payment` | error: *sealed, non-sealed or final modifiers expected* |
| Move a permitted class into another package (classpath) | error: cannot extend a sealed class in a different package |
| Add a third permitted record but do not update the switch | error: the switch expression does not cover all possible input values |
| Make the only `Circle` case guarded | error: not exhaustive (guards do not count) |
| Swap `case Integer i when i > 10` above `case Integer i` | compiles, and the guard now has a chance to match |
| Put `case CharSequence cs` above `case String s` | error: dominated case label |
| Selector is `null` and there is no `case null` | `NullPointerException`, even with `default` |
| `o instanceof String s \|\| s.isEmpty()` | error: cannot find symbol `s` |
| `case Point(int x)` for a two-component record | error: incorrect number of nested patterns |

## Exam traps checklist

> [!TRAP]
> - A sealed hierarchy is exhaustive only for **unguarded** cases. Two complementary guards are not enough.
> - `default` does **not** catch `null`. Only `case null` does.
> - Order matters: a general unguarded pattern above a specific one is a compile error (dominance), not just dead code.
> - Records implicitly have `final`; plain classes in `permits` need `final`, `sealed` or `non-sealed` written out.
> - A record cannot `extends` a sealed class. It can only `implements` a sealed interface.
> - Pattern variables live only where the match is certain; watch `||` and `if (!(...))` without a `return`.
> - Over a sealed type, a switch **statement** with patterns must be exhaustive too, so a missing subtype is a compile error even without a result value.

## Practice

Work through the checks above, then do the coding exercise: model a closed shape hierarchy and process it
with exhaustive switches and record patterns.

::exercise D3-EX-003
