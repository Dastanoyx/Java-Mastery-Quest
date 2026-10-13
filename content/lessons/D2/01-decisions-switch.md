---
id: flow-decisions-switch
domain: D2
order: 1
title: Decisions — if/else, switch Statements, switch Expressions & Patterns
summary: if/else and the dangling else, classic switch with fallthrough, switch expressions with arrows and yield, and pattern matching for instanceof and switch — guards, dominance, null handling, record patterns and exhaustiveness over sealed types.
minutes: 60
objectives: [D2.1]
prerequisites: []
contract:
  - Trace nested if/else statements correctly, pairing each else with the nearest unmatched if, and spot conditions that do not compile.
  - Predict the output of a switch statement with fallthrough, and list which selector types and case labels are legal.
  - Write switch expressions using arrows and yield, and decide whether a given switch expression is exhaustive.
  - Use type patterns, guards, record patterns and the unnamed pattern `_` in switch, and identify dominance and exhaustiveness compile errors.
  - Determine the scope of a pattern variable introduced by instanceof (flow scoping).
keyRules:
  - "An if condition must be boolean. `if (x = 5)` with int x does not compile; `if (b = true)` with boolean b does."
  - An else belongs to the nearest preceding if that has no else — indentation is irrelevant.
  - "Classic selector types: char, byte, short, int, their wrappers, String and enums (not long, float, double, boolean). Pattern switches accept any reference type."
  - "Case constants must be compile-time constants assignable to the selector type, and must be unique."
  - "A switch statement with `:` falls through until break; arrow cases never fall through. One switch cannot mix `:` and `->`."
  - "A switch expression must be exhaustive and every path must produce a value (expression after ->, or yield in a block / after :)."
  - "A case label is dominated (compile error) if an earlier unguarded pattern matches everything it would match; default must come after all pattern labels."
  - "A switch throws NullPointerException on null unless it has a `case null` label."
  - "A pattern variable is in scope only where the pattern has definitely matched (e.g. after `if (!(o instanceof String s)) return;`)."
retrieval:
  - List the selector types allowed in a switch that uses only constant labels.
  - "Write a switch expression over a sealed interface with two record implementations, using a record pattern for one of them, with no default."
  - Explain in one sentence what makes a case label "dominated" and give one example.
  - "State where `s` is in scope in `if (!(o instanceof String s)) { … } else { … }` and after the if."
checks: [D2-FLW-002]
mastery: [D2-FLW-005, D2-FLW-006, D2-FLW-008, D2-FLW-009, D2-FLW-011, D2-FLW-012, D2-FLW-014]
---

## Mental model: choosing one path

Every decision construct evaluates something **once** and picks code to run. The compiler's job is to
prove that the choice is well-formed: the condition really is a boolean, every case label could match,
no label is unreachable, and — for switch *expressions* — that **some** branch always produces a value.

- `if`/`else` chooses between two paths on a `boolean`.
- A **switch statement** jumps to a matching label and runs code (with `:` labels, it keeps going —
  *fallthrough* — until `break`).
- A **switch expression** is an expression: it must yield exactly one value of a definite type for every
  possible input.
- **Patterns** (`instanceof Type t`, `case Type t`, `case Point(int x, int y)`) test *and* deconstruct in
  one step, introducing variables whose scope the compiler tracks precisely.

## if / else: booleans only, and the dangling else

The condition must have type `boolean` (or `Boolean`, which is unboxed). Java has no "truthy" values:

```java
int x = 5;
if (x = 5) { }        // does not compile: incompatible types: int cannot be converted to boolean
boolean done = false;
if (done = true) { }  // compiles! assigns true, then tests it — a classic trap
```

Without braces, an `if` or `else` controls exactly **one** statement. An `else` pairs with the **nearest
preceding `if` that does not already have an else**, regardless of indentation:

```java predict
public class Main {
    public static void main(String[] args) {
        int x = 15;
        if (x > 10)
            if (x > 20) System.out.println("A");
        else System.out.println("B");
        System.out.println("C");
        if (x > 5) System.out.print("D");
        else if (x > 8) System.out.print("E");
        else System.out.print("F");
        if (x > 5); else System.out.print("G");
        System.out.println();
    }
}
```
```output
B
C
D
```

The `else` printing `B` belongs to `if (x > 20)` even though it is aligned with the outer `if`. An
`else if` chain stops at the **first** true condition. `if (x > 5);` has an empty statement as its body.

> [!TRAP]
> Two statements between `if` and `else` without braces — `if (c) a(); b(); else d();` — does not compile:
> *'else' without 'if'*. The `if` ended after `a();`.

## The classic switch statement

```java predict
public class Main {
    public static void main(String[] args) {
        int day = 3;
        switch (day) {
            case 1: System.out.print("one ");
            case 3: System.out.print("three ");
            default: System.out.print("default ");
            case 4: System.out.print("four ");
                break;
            case 5: System.out.print("five ");
        }
        System.out.println();
    }
}
```
```output
three default four
```

Execution jumps to `case 3` and then **falls through** every following label — including `default`, which
can appear anywhere — until a `break`. `default` is only *jumped to* when no case matches; its position
matters for fallthrough, not for matching.

**Legal selector types** for a switch with only constant labels: `char`, `byte`, `short`, `int`,
`Character`, `Byte`, `Short`, `Integer`, `String` and any enum. `long`, `float`, `double` and `boolean`
selectors are rejected in Java 25 (javac reports that primitive patterns are a preview feature).

**Case label rules:**

- Each constant must be a **compile-time constant** (literal, `final` constant variable, enum constant) —
  a plain variable gives *constant expression required*.
- It must be **assignable to the selector type**: `case 200` on a `byte` selector fails (*possible lossy
  conversion from int to byte*).
- Labels must be **unique**: `case 1:` and `case k:` with `final int k = 1` is a *duplicate case label*.
- Several constants may share one label: `case 1, 2, 3 ->` or `case "a", "A":`.
- Enum constants are written unqualified (`case RED`); since Java 21 the qualified form `case Color.RED`
  is also accepted.

A **wrapper** or **String** selector that is `null` throws `NullPointerException` (unboxing or
`hashCode()`), unless the switch has `case null`.

::check D2-FLW-001

## Arrow labels and switch expressions

An arrow case (`case X -> …`) runs **one** expression, block or `throw` and **never falls through**. A
single switch must use either all `:` labels or all `->` labels (*different case kinds used in the
switch*).

A **switch expression** produces a value:

```java predict
public class Main {
    public static void main(String[] args) {
        int v = 2;
        int r = switch (v) {
            case 1 -> 10;
            case 2 -> {
                int t = v * 5;
                yield t + 1;           // a block must yield (or throw)
            }
            default -> -1;
        };
        String s = "b";
        int q = switch (s) {           // colon form: yield, with fallthrough!
            case "a": yield 1;
            case "b": System.out.print("b-");
            case "c": yield 3;
            default: yield 0;
        };
        System.out.println(r + " " + q);
    }
}
```
```output
b-11 3
```

Rules for switch expressions:

1. **Exhaustive.** For `int`/`String` selectors this needs `default`. For an **enum** listing every constant
   is enough (no default needed). For a **sealed** type, covering every permitted subtype is enough.
2. **Every path yields.** After `->` either an expression, a block that ends in `yield value;`/`throw`, or
   a `throw`. A block that falls off the end: *switch rule completes without providing a value*.
3. **No `return`, `break` or `continue`** out of a switch expression (*attempt to return out of a switch
   expression*).
4. `yield` is a *contextual* keyword: `int yield = 5;` still compiles outside a switch.
5. The result type follows the conditional-operator rules: `switch (x) { case 1 -> 1; default -> 2.0; }`
   is a `double`.

A switch **statement** is required to be exhaustive only when it uses patterns or `case null`; a plain
`switch (enumValue)` statement may cover just some constants.

> [!TRAP]
> `case 3 -> yield "y";` does not compile. With an arrow, the value is written directly (`case 3 -> "y";`);
> `yield` is only for blocks and `:` cases.

::check D2-FLW-004

## Pattern matching with instanceof: flow scoping

`o instanceof String s` tests the type **and** binds `s`. The variable is in scope only where the compiler
can prove the match succeeded:

| Code | Is `s` in scope … |
|---|---|
| `if (o instanceof String s) { A } else { B }` | in `A` only |
| `if (o instanceof String s && s.length() > 3)` | on the right of `&&` and in the then-block |
| `if (o instanceof String s \|\| s.isEmpty())` | **not** on the right of `\|\|` → *cannot find symbol* |
| `if (!(o instanceof String s)) { return; }` *then* code after the if | **after the if statement** |
| `while (!(o instanceof String s)) { … }` *then* code after | after the loop |

```java predict
public class Main {
    String s = "field";
    void m(Object o) {
        if (!(o instanceof String s)) {
            System.out.println(s);          // the pattern did NOT match: this is the field
            return;
        }
        System.out.println(s.toUpperCase()); // the pattern variable
    }
    public static void main(String[] args) {
        new Main().m(5);
        new Main().m("pattern");
    }
}
```
```output
field
PATTERN
```

Other rules: the expression's static type must be castable to the pattern type (`String s = "x"; s
instanceof Integer` is a compile error), and a pattern variable is not implicitly final — you may reassign
it unless you declare it `final`.

## Pattern matching in switch

A switch over a reference type can use **type patterns** (`case Integer i`), **record patterns**
(`case Point(int x, int y)`), **guards** (`case Integer i when i > 100`) and **`case null`**.

```java predict
public class Main {
    static String classify(Object o) {
        return switch (o) {
            case null -> "null";
            case Integer i when i > 100 -> "large";
            case Integer i -> "int:" + i;
            case String s when s.isBlank() -> "blank";
            case String s -> s.length() + " chars";
            default -> o.getClass().getSimpleName();
        };
    }
    public static void main(String[] args) {
        System.out.println(classify(7) + " | " + classify(500) + " | " + classify(" "));
        System.out.println(classify("abc") + " | " + classify(null) + " | " + classify(2.5));
    }
}
```
```output
int:7 | large | blank
3 chars | null | Double
```

Labels are tried **top to bottom**; the first matching pattern whose guard is true wins.

**Dominance.** A label is a compile error if an earlier label already matches everything it could match:

```java
case Integer i -> …
case Integer i when i > 40 -> …   // error: this case label is dominated by a preceding case label
case Number n -> …
case Integer i -> …               // error: dominated (Integer is a Number)
default -> …
case String s -> …                // error: dominated — default must follow all patterns
```

A **guarded** pattern never dominates an unguarded one (the compiler does not evaluate guards), so put
guarded cases first. Constant labels may precede a type pattern of the same type (`case 1 ->` then
`case Integer i ->` with an `Integer` selector).

**null.** Without `case null`, a pattern switch throws `NullPointerException` when the selector is null —
`default` does **not** catch null. You can write `case null -> …` or `case null, default -> …`.

**Exhaustiveness.** A pattern switch (statement *or* expression) must be exhaustive. Over `Object` that
means a `default` or an unconditional pattern like `case Object o`. Over a **sealed** hierarchy, listing all
permitted subtypes suffices:

```java predict
sealed interface Shape permits Circle, Square {}
record Circle(double r) implements Shape {}
record Square(double side) implements Shape {}
public class Main {
    static String describe(Shape s) {
        return switch (s) {
            case Circle c when c.r() == 0 -> "point";
            case Circle c -> "circle r=" + c.r();
            case Square(double side) -> "square area=" + side * side;
        };
    }
    public static void main(String[] args) {
        System.out.println(describe(new Square(3)));
        System.out.println(describe(new Circle(0)));
    }
}
```
```output
square area=9.0
point
```

Remove `case Square(...)` and the code fails: *the switch expression does not cover all possible input
values*. Remove `case Circle c` (the unguarded one) and it fails too — a guarded case does not count
toward exhaustiveness.

**Record patterns** deconstruct: `case Point(int x, int y)` matches a non-null `Point` and binds its
components; components may use `var` or nested patterns (`case Pair(Box(var inner), var b)`). With
`:` labels, falling through *into* a pattern label is illegal (*illegal fall-through to a pattern*).

> [!J25]
> The **unnamed pattern** and **unnamed variable** `_` (JEP 456, final since Java 22) let you ignore
> what you do not need: `case Point(int x, _) ->`, `case String _, Integer _ -> "text or number"`,
> `catch (NumberFormatException _)`, `for (String _ : list)`. Multiple patterns in one case label are only
> allowed when they declare no named variables. `_` cannot be read: `int _ = 5; System.out.println(_);` does
> not compile.

::check D2-FLW-007

## What if…? One change at a time

| Change | Result |
|---|---|
| Add braces around the inner `if` in a dangling-else | the `else` now belongs to the outer `if` |
| Selector `int` → `long` | does not compile in Java 25 (primitive patterns are preview) |
| `case k:` with `int k = 2` → `final int k = 2` | compiles (constant variable) |
| `case 1 ->` … `case 2:` in one switch | *different case kinds used in the switch* |
| Remove `default` from an `int` switch expression | *does not cover all possible input values* |
| Remove `default` from an enum switch expression listing all constants | still compiles |
| Swap `case Integer i` and `case Integer i when i > 40` | compiles; guarded case first |
| Add `case null` to a pattern switch | null no longer throws NPE |
| `if (o instanceof String s && …)` → `\|\|` | `s` not in scope on the right side |

## Exam traps checklist

> [!TRAP]
> - `default` placement only matters for fallthrough in a `:` switch; it is still chosen only when nothing else matches.
> - Arrow cases cannot fall through; you do not need `break` (but `break` inside an arrow block of a switch **statement** is legal).
> - `switch` on a `null` String or `Integer` throws `NullPointerException` even if a `default` exists.
> - In a sealed-type switch without `default`, a `null` selector still throws NPE.
> - `case Integer i when i > 3` and `case Integer i when i <= 3` together are **not** exhaustive: guards are not analysed.
> - A local variable declared in one `case :` group is in scope in later groups (same block) but is not initialised there.

## Practice

::check D2-FLW-003

::check D2-FLW-010

::check D2-FLW-013

::exercise D2-EX-001
