---
id: oop-overloading
domain: D3
order: 3
title: Method Overloading, Overload Resolution & Varargs
summary: What makes two methods different, how the compiler picks one overload in three phases (widening, then boxing, then varargs), when a call is ambiguous, and the rules for declaring and calling var-arg methods.
minutes: 50
objectives: [D3.3]
prerequisites: [oop-constructors]
contract:
  - Decide whether two method declarations are legal overloads, citing the signature rule (name + parameter types after erasure).
  - Predict which overload a call selects by running the three resolution phases and the most-specific test.
  - Recognise ambiguous calls (including null arguments and mixed boxing/widening) and explain the compile error.
  - Declare var-arg methods correctly and predict their behaviour when called with no arguments, an array, or null.
keyRules:
  - "A method signature is its name plus its parameter types. Return type, parameter names, throws clause, and static/final/access modifiers are not part of it."
  - "Overload resolution phase 1: identity and widening only (no boxing, no varargs). Phase 2: adds boxing/unboxing. Phase 3: adds variable arity. The first phase that finds an applicable method decides."
  - Within a phase, the most specific method wins; if none is more specific than all others, the call is ambiguous — a compile error at the call.
  - Overload resolution uses compile-time (declared) types of arguments; runtime types only matter for overriding.
  - "A method may have one varargs parameter, and it must be last. Inside the method it is an array; calling with zero arguments passes an empty array, calling with null passes null."
  - Two methods whose parameter types have the same erasure (List<String> vs List<Integer>) cannot coexist — name clash.
retrieval:
  - Write the three overload-resolution phases from memory, with one example call that is decided in each.
  - List four things that are NOT part of a method signature.
  - Give a call that is ambiguous between m(String) and m(StringBuilder) and the fix.
checks: [D3-OVL-001, D3-OVL-002]
mastery: [D3-OVL-006, D3-OVL-009, D3-OVL-010, D3-OVL-011, D3-OVL-012, D3-OVL-013]
---

## Mental model: overloading is chosen by the compiler, once

**Overloading** means one class has several methods with the same name but different parameter lists. It is
a convenience for the *caller*: `println(int)`, `println(String)`, `println(Object)` all read as "print this".

The crucial point: **the compiler picks the overload**, at compile time, using only the **declared types** of
the arguments. The chosen signature is written into the bytecode. At runtime nothing is re-decided — except
that, if the chosen method is overridden in a subclass, dynamic dispatch picks the override of *that
signature*. Overloading = compile time. Overriding = runtime.

```java predict
public class Main {
    static void pay(int amount)       { System.out.println("int " + amount); }
    static void pay(double amount)    { System.out.println("double " + amount); }
    static void pay(String currency, int amount) { System.out.println(currency + " " + amount); }
    static void pay(int amount, String currency) { System.out.println(amount + " " + currency); }
    public static void main(String[] args) {
        pay(10);
        pay(10.5f);
        pay("EUR", 5);
        pay(5, "TND");
    }
}
```
```output
int 10
double 10.5
EUR 5
5 TND
```

The number, types **and order** of parameters all distinguish overloads. `10.5f` is a `float`: there is no
`pay(float)`, so it widens to `double`.

## The signature rule: what counts and what does not

| Part of the declaration | Distinguishes overloads? |
|---|---|
| method name | yes (that is what makes it overloading) |
| number, types and order of parameters | **yes** |
| return type | no |
| parameter names | no |
| `throws` clause | no |
| `static`, `final`, access modifier | no |
| generic type arguments (`List<String>` vs `List<Integer>`) | no — erased: *name clash: … have the same erasure* |
| `int[]` vs `int...` | no — both are `int[]`: *cannot declare both m(int...) and m(int[])* |

```java
static int  parse(String s)    { ... }
static long parse(String text) { ... }   // error: method parse(String) is already defined
static void log(int a)  { }
void        log(int a)  { }               // error: already defined — static is not part of the signature
```

::check D3-OVL-001

## Overload resolution in three phases (JLS §15.12.2)

For a call `m(args)`, the compiler collects the methods named `m` that are accessible, then tries:

1. **Phase 1 — strict invocation:** identity and **widening** conversions only (primitive widening such as
   `int → long → float → double`, `char → int`; reference widening such as `String → Object`). No boxing,
   no varargs.
2. **Phase 2 — loose invocation:** additionally allows **boxing and unboxing** (`int → Integer → Object`,
   `Integer → int → long`).
3. **Phase 3 — variable arity:** additionally allows varargs methods to collect arguments into an array.

The first phase that finds **at least one** applicable method stops the search. Among the applicable methods
of that phase the compiler picks the **most specific** one.

```java predict
public class Main {
    static String m(long x)    { return "long"; }
    static String m(Integer x) { return "Integer"; }
    static String m(int... x)  { return "int..."; }
    public static void main(String[] args) {
        byte b = 1;
        System.out.println(m(b));
        System.out.println(m(Integer.valueOf(2)));
        System.out.println(m());
        System.out.println(m(1, 2));
    }
}
```
```output
long
Integer
int...
int...
```

- `m(b)`: phase 1 — `byte` widens to `long`. Boxing a `byte` would give `Byte`, never `Integer`.
- `m(Integer.valueOf(2))`: phase 1 — identity match on `Integer`. (Unboxing to reach `long` is phase 2.)
- `m()` and `m(1, 2)`: only the varargs method can take zero or two arguments → phase 3.

> [!RULE]
> Boxing never combines with a widening *primitive* conversion first: an `int` can become `Integer` and then
> widen as a reference to `Number`/`Object`, but it can **never** become a `Long`. `static void m(Long x)` called
> as `m(5)` fails with *incompatible types: int cannot be converted to Long*.

### The most specific method

Within a phase, method A is more specific than B if every parameter type of A could be passed to B
(primitive: A's type widens to B's; reference: A's type is a subtype of B's). So `int` beats `long`,
`long` beats `float`, `String` beats `Object`, `Integer[]` beats `Object`.

```java predict
public class Main {
    static String m(Object o) { return "Object"; }
    static String m(long l)   { return "long"; }
    static String m(Long l)   { return "Long"; }
    public static void main(String[] args) {
        int i = 5;
        Integer boxed = 5;
        System.out.println(m(i) + " " + m(boxed) + " " + m(5L));
    }
}
```
```output
long Object long
```

`m(boxed)` surprises many people: in **phase 1**, `Integer` widens (as a reference) to `Object`, so
`m(Object)` is applicable and phase 2 — where unboxing to `long` would have been possible — is never
reached. `Integer` is not a `Long`, so `m(Long)` never applies.

::check D3-OVL-002

## Ambiguity: when no method wins

If a phase finds several applicable methods and none is more specific than all the others, the call is
**ambiguous** — a compile-time error *at the call*, even though the declarations are legal.

```java predict
public class Main {
    static void m(int a, double b) { System.out.println("int,double"); }
    static void m(double a, int b) { System.out.println("double,int"); }
    public static void main(String[] args) { m(1, 2); }
}
```
```output
Compilation fails: reference to m is ambiguous
```

Each method is better in one position and worse in the other. The same happens with
`m(Integer, long)` vs `m(long, Integer)` called as `m(1, 1)`: both need exactly one boxing (phase 2) and
neither is more specific.

**`null` arguments.** `null` fits every reference type, so all reference overloads apply:

```java predict
public class Main {
    static void m(String s) { System.out.println("String"); }
    static void m(Object o) { System.out.println("Object"); }
    public static void main(String[] args) { m(null); m((Object) null); }
}
```
```output
String
Object
```

`String` is a subtype of `Object`, so it is more specific. Add `m(StringBuilder)` and `m(null)` becomes
ambiguous — `String` and `StringBuilder` are unrelated. A cast picks one: `m((String) null)`.

> [!TRAP]
> Static and instance methods compete in the **same** resolution. In a static method, a call `log(5)` with
> `static log(long)` and instance `log(int)` picks `log(int)` (more specific) and *then* fails with
> *non-static method log(int) cannot be referenced from a static context*. The compiler does not fall back
> to `log(long)`.

## Varargs: declaration and calling rules

`String... names` declares a **variable-arity** parameter. Inside the method, `names` is a `String[]`.

- Only **one** varargs parameter per method, and it must be the **last** parameter
  (*varargs parameter must be the last parameter*).
- The `...` goes between the type and the name: `int... xs` (also legal: `int ...xs`); `int xs...` is a
  syntax error.
- Callers may pass zero or more values, or an existing array.

```java predict
public class Main {
    static String total(int... values) {
        int sum = 0;
        for (int v : values) sum += v;
        return values.length + ":" + sum;
    }
    public static void main(String[] args) {
        System.out.println(total());
        System.out.println(total(4));
        System.out.println(total(1, 2, 3));
        System.out.println(total(new int[] {10, 20}));
    }
}
```
```output
0:0
1:4
3:6
2:30
```

Zero arguments produce an **empty array**, never `null`. But a caller can pass `null` explicitly: `null`
is assignable to `int[]`, so it is passed as the array itself and `values.length` throws
`NullPointerException`. With `Object... args`, `m(null)` likewise passes a `null` array, while
`m((Object) null)` passes a one-element array containing `null`.

> [!TRAP]
> In phases 1 and 2 a varargs method still participates — as a fixed-arity method taking an array. So with
> `m(Object)` and `m(Integer...)`, `m(new Integer[]{1})` picks `Integer...` (as `Integer[]`, more specific
> than `Object`), while `m(1)` picks `m(Object)` via boxing in phase 2 — varargs spreading is phase 3.

## Overloading vs overriding

| | Overloading | Overriding |
|---|---|---|
| Where | same class (or inherited + new in subclass) | subclass redefines an inherited method |
| Parameter list | **must differ** | **must be the same** (after erasure) |
| Return type | anything | same or covariant subtype |
| Decided | compile time, from declared types | runtime, from the object's class |
| `@Override` | an error if you put it on an overload | recommended |

A subclass method `speak(String)` next to an inherited `speak(Object)` is an **overload**, not an override.
Through a reference of the superclass type only `speak(Object)` is visible, so the subclass method never
runs — a classic trap that `@Override` would catch at compile time.

## What if…? One change at a time

| Change | Result |
|---|---|
| Two methods differ only in return type | *already defined* |
| `m(long)` and `m(Integer)`, call `m(5)` | `long` — widening (phase 1) beats boxing |
| Remove `m(long)`; keep `m(Integer)`, `m(Object)` | `Integer` — boxing in phase 2, most specific |
| `m(char)` and `m(int)`, call `m('a' + 1)` | `int` — `'a' + 1` is an `int` expression |
| `m(short)` only, call `m(c)` with `char c` | does not compile — `char → short` is narrowing |
| `m(int...)` and `m(long...)`, call `m(1)` | `int...` — the most specific varargs method |
| `m(int, int...)` and `m(int...)`, call `m(1)` | ambiguous |
| `m(List<String>)` and `m(List<Integer>)` in one class | *name clash: … same erasure* |

## Exam traps checklist

> [!TRAP]
> - The **declared** type of an argument chooses the overload: `Object o = "x"; m(o);` calls `m(Object)`.
> - Widening beats boxing beats varargs — regardless of how "natural" the boxed type looks.
> - `int → Long` is impossible (boxing produces `Integer`, which is not a `Long`).
> - Method invocation never narrows: `m(byte)` cannot be called with the literal `5` (assignment contexts
>   may narrow constants, method calls may not).
> - Ambiguity errors appear at the **call**, not at the declarations.
> - A varargs parameter receives an empty array for zero arguments, but `null` if the caller passes `null`.

## Practice

::check D3-OVL-003

::check D3-OVL-004

::check D3-OVL-005

::check D3-OVL-007

::check D3-OVL-008
