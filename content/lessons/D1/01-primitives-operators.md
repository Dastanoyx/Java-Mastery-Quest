---
id: values-primitives-operators
domain: D1
order: 1
title: Primitives, Wrappers, Promotion & Operators
summary: The eight primitive types and their wrappers, literal syntax, numeric promotion, casting and overflow, integer vs floating-point arithmetic, operator precedence, increment traps, short-circuit logic, ternary typing and the Math API.
minutes: 55
objectives: [D1.1]
prerequisites: []
contract:
  - Predict the exact type and value of any arithmetic expression, applying binary numeric promotion, casting and overflow rules.
  - Decide whether an assignment compiles, distinguishing simple assignment (needs a cast) from compound assignment (implicit cast) and constant narrowing.
  - Explain when `==` on wrapper objects is true, why `Integer` caching makes it unreliable, and when unboxing throws `NullPointerException`.
  - Evaluate expressions mixing pre/post increment, short-circuit and non-short-circuit operators, and the conditional operator, with the correct result type.
  - Use `Math.round/floor/ceil/floorDiv/floorMod/addExact` and state their results on negative numbers and overflow.
keyRules:
  - "Binary numeric promotion: if either operand is double → double; else float → float; else long → long; else both become int. So byte + byte is an int."
  - "Compound assignment `a op= b` means `a = (T)(a op b)` — it contains a hidden cast; `a = a op b` does not."
  - "An int constant expression may be assigned to byte/short/char without a cast if its value fits (assignment context only)."
  - "Integer.valueOf (and autoboxing) caches -128..127, so `==` between two equal boxed Integers in that range is true, outside it usually false. Always compare wrappers with equals()."
  - "Integer division truncates toward zero; the sign of `%` follows the dividend. Integer division by zero throws ArithmeticException; floating division by zero gives Infinity or NaN."
  - "Math.round(x) is floor(x + 0.5): Math.round(-2.5) is -2, Math.round(2.5) is 3."
  - "&& and || short-circuit; & | ^ on booleans always evaluate both operands."
  - "Unboxing a null wrapper throws NullPointerException — including the hidden unboxing inside a numeric conditional `cond ? 0 : map.get(k)`."
retrieval:
  - List the eight primitive types with their sizes in bits, and the literal suffixes for long and float.
  - Write the four steps of binary numeric promotion from memory.
  - "Explain why `short s = 1; s = s + 1;` fails but `s += 1;` compiles."
  - "State the results of -7 / 2, -7 % 2, Math.floorDiv(-7, 2) and Math.floorMod(-7, 2)."
  - Give one expression that evaluates to Infinity, one that evaluates to NaN and one that throws ArithmeticException.
checks: [D1-PRM-013]
mastery: [D1-PRM-004, D1-PRM-005, D1-PRM-007, D1-PRM-008, D1-PRM-009, D1-PRM-010, D1-PRM-012]
---

## Mental model: values in boxes of fixed width

A primitive variable holds its value **directly**, in a slot of fixed width. Everything about overflow,
casting and promotion follows from that width:

| Type | Bits | Range / notes | Default (fields) | Wrapper |
|---|---|---|---|---|
| `boolean` | — | `true` / `false` only; never converts to or from a number | `false` | `Boolean` |
| `byte` | 8 | -128 … 127 | `0` | `Byte` |
| `short` | 16 | -32 768 … 32 767 | `0` | `Short` |
| `char` | 16 | 0 … 65 535 (unsigned!) | `'\u0000'` | `Character` |
| `int` | 32 | about ±2.1 billion | `0` | `Integer` |
| `long` | 64 | about ±9.2 × 10¹⁸ | `0L` | `Long` |
| `float` | 32 | IEEE 754 single precision | `0.0f` | `Float` |
| `double` | 64 | IEEE 754 double precision | `0.0` | `Double` |

A **wrapper** (`Integer`, `Double`, …) is an ordinary immutable **object** on the heap. A wrapper reference
can be `null`, can be compared by identity with `==`, and is converted automatically to and from its
primitive (**autoboxing** / **unboxing**). Almost every wrapper trap comes from forgetting that it is an
object.

Arithmetic never happens in `byte`, `short` or `char`. The JVM computes in `int`, `long`, `float` or
`double` — so the compiler **widens** small operands first (*numeric promotion*) and insists on an explicit
cast when you want to squeeze the result back into a narrower box.

> [!NOTE]
> `char` is a numeric type. `'a' + 1` is the `int` 98, and `(char) ('a' + 1)` is `'b'`. But `boolean` is not
> numeric at all: `(int) true` and `if (1)` do not compile.

## Literals: how you write values

```java
int million = 1_000_000;     // underscores between digits only
int octal   = 017;           // leading 0 → octal (15). 09 does not compile: illegal digit in an octal literal
int hex     = 0x1F;          // 31
int binary  = 0b1010;        // 10
long big    = 3_000_000_000L; // without L: "integer number too large"
float f     = 3.14f;         // without f: possible lossy conversion from double to float
double d    = 1e3;           // 1000.0 — a decimal literal with a dot or exponent is a double
char c      = 'A';           // also: 'A', or 65 (an int constant that fits)
```

Underscore rules: an underscore must sit **between two digits**. `1_000_`, `_1000` (that is an identifier),
`0x_1F`, `1_.5` and `1._5` are all illegal; `0_7` (octal 7) and `1__0` are legal.

> [!TRAP]
> An integer literal is an `int` unless it ends in `L`/`l`. `long x = 3_000_000_000;` fails to compile even
> though the target is a `long` — the literal itself is out of `int` range.

## Numeric promotion and assignment conversion

**Binary numeric promotion** applies to the operands of `+ - * / % < <= > >= == != & | ^` and the
conditional operator:

1. If either operand is `double`, the other is converted to `double`.
2. Otherwise, if either is `float`, the other becomes `float`.
3. Otherwise, if either is `long`, the other becomes `long`.
4. Otherwise **both become `int`** — even `byte + byte` and `char + char`.

Unary `+`, `-`, `~` and array indexes promote `byte`/`short`/`char` to `int` too.

**Assignment** then needs a *widening* conversion (`int → long → float → double`, `char → int`, …) or an
explicit cast. Two exceptions make the exam interesting:

- **Constant narrowing.** If the right-hand side is a *compile-time constant expression* of type `int`
  (or `short`/`char`/`byte`) and its value fits, it may be assigned to `byte`, `short` or `char` without a
  cast: `byte b = 10;`, `char c = 65;`, and with `final byte x = 10, y = 20;` even `byte z = x + y;`.
- **Compound assignment** `a op= b` is defined as `a = (T) ((a) op (b))` where `T` is the type of `a`. The
  cast is hidden, so `b += 300` compiles for a `byte` — and silently overflows.

```java predict
public class Main {
    public static void main(String[] args) {
        short s = 10;
        s *= 1000;          // 10_000 fits in short
        s *= 10;            // 100_000 does not: hidden (short) cast wraps around
        int m = 7;
        m /= 2.5;           // m = (int) (7 / 2.5) = (int) 2.8
        char c = 'a';
        c += 2;             // compound assignment on a char
        long big = Integer.MAX_VALUE * 2;    // int * int overflows BEFORE widening
        long ok  = Integer.MAX_VALUE * 2L;   // long arithmetic
        System.out.println(s + " " + m + " " + c + " " + big + " " + ok);
    }
}
```
```output
-31072 2 c -2 4294967294
```

The same assignment without the compound operator is rejected:

```java predict
public class Main {
    public static void main(String[] args) {
        byte a = 10, b = 20;
        byte c = a + b;
        System.out.println(c);
    }
}
```
```output
Compilation fails: incompatible types: possible lossy conversion from int to byte
```

Make `a` and `b` `final` and it compiles: `a + b` becomes a constant expression with value 30, which fits.
`final int big = 200; byte d = big;` still fails — 200 does not fit in a byte.

::check D1-PRM-002

## Casting, overflow and the two kinds of division

A **cast** to a narrower integral type keeps only the low-order bits: `(byte) 200` is `-56`,
`(byte) 128` is `-128`. A cast from floating point to an integral type **truncates toward zero**
(`(int) 3.99` → 3, `(int) -3.99` → -3), saturates at the type's min/max (`(long) 1e20` → `Long.MAX_VALUE`)
and turns `NaN` into 0. Integer overflow is **silent**: `Integer.MAX_VALUE + 1` is `Integer.MIN_VALUE`.

| Operation | `int` / `long` | `float` / `double` |
|---|---|---|
| `7 / 2` | `3` (truncates toward zero; `-7 / 2` is `-3`) | `3.5` |
| `x / 0` | **`ArithmeticException: / by zero`** | `Infinity`, `-Infinity`, or `NaN` for `0.0 / 0` |
| `%` | sign follows the **dividend**: `-7 % 2` → `-1`, `7 % -2` → `1` | works too: `10 % 3.5` → `3.0` |
| equality | exact | `0.1 + 0.2 == 0.3` is false; `NaN == NaN` is false |

```java predict
public class Main {
    public static void main(String[] args) {
        System.out.println(-7 / 2 + " " + -7 % 2 + " " + Math.floorDiv(-7, 2) + " " + Math.floorMod(-7, 2));
        System.out.println(0.1 + 0.2);
        System.out.println(1.0 / 0 + " " + 0.0 / 0 + " " + (Double.NaN == Double.NaN));
        System.out.println((byte) 200 + " " + (int) -3.99 + " " + (char) ('a' + 1));
        System.out.println(Math.round(-2.5) + " " + Math.round(2.5) + " " + Math.ceil(-0.5));
        System.out.println(Math.abs(Integer.MIN_VALUE));
        System.out.println(Math.addExact(Integer.MAX_VALUE, 1));
    }
}
```
```output
-3 -1 -4 1
0.30000000000000004
Infinity NaN false
-56 -3 b
-2 3 -0.0
-2147483648
Exception in thread "main" java.lang.ArithmeticException: integer overflow
```

Line by line:

- `floorDiv` rounds toward **negative infinity** (-3.5 → -4) and `floorMod` takes the sign of the
  **divisor**, so `floorMod(-7, 2)` is `1`, unlike `-7 % 2`.
- `Math.round(x)` is `floor(x + 0.5)`: -2.5 + 0.5 = -2.0 → `-2`. `round(double)` returns `long`,
  `round(float)` returns `int`.
- `Math.ceil(-0.5)` is `-0.0`; `floor`/`ceil` return `double`, never an integral type.
- `Math.abs(Integer.MIN_VALUE)` overflows back to itself.
- `Math.addExact`, `subtractExact`, `multiplyExact`, `incrementExact`, `toIntExact` throw
  `ArithmeticException` instead of wrapping.

`Math.min`/`max` are overloaded for `int`, `long`, `float`, `double`; `Math.max(1, 2L)` uses the `long`
version and returns `2L`. `Math.sqrt(-1)` is `NaN`; `Math.pow` always returns `double`.

> [!TRAP]
> `long big = Integer.MAX_VALUE * 2;` does **not** produce a big number: both operands are `int`, the
> multiplication overflows in `int`, and only the wrong result is widened. Make one operand `long` (`2L`).

## Operators: precedence, increments, short-circuit and the conditional

From highest to lowest precedence (the subset the exam uses):

| Level | Operators | Associativity |
|---|---|---|
| postfix | `x++` `x--` | — |
| unary | `++x` `--x` `+` `-` `!` `~` `(type)` | right to left |
| multiplicative | `*` `/` `%` | left to right |
| additive | `+` `-` (and string `+`) | left to right |
| shift | `<<` `>>` `>>>` | left to right |
| relational | `<` `>` `<=` `>=` `instanceof` | left to right |
| equality | `==` `!=` | left to right |
| logical/bitwise | `&` then `^` then `\|` | left to right |
| conditional-and/or | `&&` then `\|\|` | left to right |
| conditional | `? :` | right to left |
| assignment | `=` `+=` `-=` … | right to left |

Precedence decides **grouping**; evaluation is still **left to right** — Java evaluates the left operand
fully before the right one, and the operands before the operator. Combine that with increments:

- `i++` yields the **old** value, then increments; `++i` increments, then yields the **new** value.
- `i = i++;` leaves `i` unchanged: the old value is saved, `i` is incremented, then the saved value is
  assigned back.

```java predict
public class Main {
    static boolean t(String s) { System.out.print(s); return true; }
    static boolean f(String s) { System.out.print(s); return false; }
    public static void main(String[] args) {
        int i = 5;
        i = i++ + ++i;                 // 5 + 7
        int a = 2;
        int b = a++ * a-- + --a;       // 2 * 3 + 1
        System.out.println(i + " " + a + " " + b);
        boolean r = f("A") && t("B") || t("C") & f("D") | t("E");
        System.out.println(" " + r);
        System.out.println(8 >> 1 + 1);
        int n = 5;
        System.out.println(n > 3 ? n < 10 ? "mid" : "big" : "small");
    }
}
```
```output
12 1 7
ACDE true
2
mid
```

`&&` and `||` are **short-circuit**: `f("A") && …` stops after `A`, so `B` is never printed. `&`, `|` and
`^` on booleans are **logical but not short-circuit**: both sides of `t("C") & f("D")` run. Grouping by
precedence gives `(A && B) || ((C & D) | E)`. In `8 >> 1 + 1`, `+` binds tighter than `>>`, so it is
`8 >> 2`.

**The conditional operator's type** is not "whatever branch runs". It is fixed at compile time:

| Operands | Result type |
|---|---|
| both numeric (incl. boxed numerics) | binary numeric promotion: `true ? 1 : 2.0` is the `double` `1.0` |
| `char` and an `int` **constant** that fits in `char` | `char`: `false ? 'A' : 66` is `'B'` |
| `int` and `Integer` | `int` — the `Integer` is **unboxed**, so a `null` throws NPE |
| unrelated references (`1` and `"s"`) | a common supertype (`Object`); `1` is boxed |

::check D1-PRM-006

> [!TRAP]
> `if (flag = true)` compiles for a `boolean flag` (the assignment's value is `true`); `if (x = 5)` with an
> `int x` does not. Exam code uses this to hide an assignment inside a condition.

## Wrappers: caching, equality and unboxing

Autoboxing calls `Integer.valueOf(int)`, which returns **cached** objects for -128 … 127 (also cached:
`Byte`, `Short`, `Long` in that range, `Character` 0 … 127, both `Boolean` values; `Float` and `Double`
are never cached).

```java predict
public class Main {
    public static void main(String[] args) {
        Integer a = 127, b = 127, c = 128, d = 128;
        System.out.println((a == b) + " " + (c == d) + " " + c.equals(d));
        int prim = 128;
        System.out.println(c == prim);          // Integer == int → unboxing, numeric compare
        Long big = 127L;
        System.out.println(big.equals(127) + " " + big.equals(127L));
        Double x = 1.0, y = 1.0;
        System.out.println(x == y);
    }
}
```
```output
true false true
true
false true
false
```

- `==` between two **references** compares identity. It is `true` for 127 only because both boxes are the
  same cached object.
- `==` between a wrapper and a **primitive** unboxes the wrapper and compares values.
- `equals` checks the type first: `Long.equals(Integer)` is `false` even for equal values, because `127`
  is boxed to an `Integer`.
- `Long == Integer` (two references of unrelated types) does not compile: *incomparable types*.

**Unboxing `null` throws `NullPointerException`.** It happens wherever the compiler inserts `intValue()`:
assignment to a primitive (`int v = map.get(k);`), arithmetic, `switch`, and the conditional operator when
one branch is a primitive.

Parsing: `Integer.parseInt("42")` returns an `int`; `Integer.valueOf("42")` returns an `Integer`; both
throw `NumberFormatException` for bad input (`"4.2"`, `""`, `null`).

> [!TRAP]
> `Integer x = 1000, y = 1000; x == y` is `false` with the default JVM settings — but do not memorise
> "false above 127": the upper cache bound can be raised with a JVM option. The only reliable statement is
> that `==` on wrappers compares identity; use `equals`.

## What if…? One change at a time

| Change | Result |
|---|---|
| `byte c = a + b;` → `byte c = (byte) (a + b);` | compiles; may wrap around |
| `byte c = a + b;` with `final byte a = 10, b = 20` | compiles: constant expression 30 fits |
| `b = b + 1;` → `b += 1;` (byte `b`) | compiles thanks to the hidden cast |
| `long x = 3_000_000_000;` → add `L` | compiles |
| `1 / 0` → `1.0 / 0` | `Infinity` instead of `ArithmeticException` |
| `Integer a = 127, b = 127` → `128` | `a == b` becomes `false` (default cache) |
| `x & (10 / x > 1)` with `x == 0` → `&&` | no `ArithmeticException`: right side skipped |
| `true ? 1 : 2.0` → `true ? 1 : "2"` | result is the boxed `Integer` 1, prints `1` not `1.0` |
| `Math.round(-2.5)` → `Math.round(-2.6)` | `-3` |

## Exam traps checklist

> [!TRAP]
> - `char + int` is an `int`: `System.out.println('A' + 1)` prints `66`, while `"" + 'A' + 1` prints `A1`.
> - `float f = 1.5;` does not compile (a `double` literal); `float f = 1;` does (int widens to float).
> - Widening `int → float` or `long → double` can lose precision silently: `(int) (float) 123456789` is `123456792`.
> - `Math.abs(Integer.MIN_VALUE)` is negative. `Math.round` returns `long` for a `double` argument — `int r = Math.round(2.5);` does not compile.
> - `x == y` where both are `Integer` compares references; where one is `int`, it compares values.
> - The conditional `c ? 0 : map.get(k)` has type `int`; a `null` from `get` throws NPE even if you assign the result to an `Integer`.
> - `-0.0 == 0.0` is `true`, but `Double.valueOf(0.0).equals(-0.0)` is `false`.

## Practice

::check D1-PRM-001

::check D1-PRM-003

::check D1-PRM-011
