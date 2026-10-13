---
id: streams-lambdas
domain: D6
order: 1
title: Lambdas, Functional Interfaces & Method References
summary: What a lambda really is (an implementation of one abstract method chosen by the target type), the exact syntax rules, effectively-final capture, `this` semantics, the java.util.function catalogue with its primitive specializations, composition methods, and the four kinds of method reference.
minutes: 55
objectives: [D6.1]
prerequisites: []
contract:
  - Decide whether a lambda expression compiles, citing the exact syntax rule (parentheses, explicit/implicit/var parameters, block bodies and return).
  - Explain target typing and use it to predict which overload a lambda selects and why `var f = x -> x;` is illegal.
  - Apply the effectively-final rule for captured locals and contrast `this` inside a lambda with `this` inside an anonymous class.
  - Pick the right java.util.function interface (including primitive specializations) and compose functions with andThen, compose, and, or, negate, Predicate.not and Function.identity.
  - Classify a method reference as static, bound, unbound or constructor, and recognise when it is ambiguous.
keyRules:
  - A lambda has no type of its own; it needs a target type that is a functional interface (exactly one abstract method, not counting public Object methods).
  - "Parameters are either all implicit (`(a, b)`), all explicit (`(int a, int b)`) or all `var` (`(var a, var b)`); mixing is a compile error. A single implicit parameter may drop the parentheses."
  - "A block body `{ ... }` needs `return` for a value-returning interface; an expression body never uses `return`."
  - Captured local variables (and parameters) must be final or effectively final; instance and static fields may change freely.
  - "`this` inside a lambda is the enclosing instance; inside an anonymous class it is the anonymous object."
  - A lambda parameter or a local inside a lambda body cannot reuse the name of a local variable in scope (lambdas do not open a new scope for shadowing).
  - "Method reference kinds: `Type::staticMethod`, `obj::instanceMethod` (bound), `Type::instanceMethod` (unbound — first parameter becomes the receiver), `Type::new` / `int[]::new`."
retrieval:
  - Write, from memory, the single abstract method name and signature of Predicate, Function, Consumer, Supplier, UnaryOperator, BinaryOperator, BiFunction, ToIntFunction, IntFunction and ObjIntConsumer.
  - Explain in two sentences why `f.andThen(g)` and `f.compose(g)` give different results for `x -> x + 1` and `x -> x * 2`.
  - List three different compile errors a lambda can produce and the exact cause of each.
checks: []
mastery: [D6-LAM-005, D6-LAM-006, D6-LAM-007, D6-LAM-008, D6-LAM-009]
---

## Mental model: a lambda is an anonymous method looking for an interface

A lambda expression such as `s -> s.isEmpty()` is **not an object with a type of its own**. It is the body of
a single method, and the compiler decides *which* method it implements by looking at the context — the
**target type**. In `Predicate<String> p = s -> s.isEmpty();` the target type is `Predicate<String>`, whose
one abstract method is `boolean test(String)`, so `s` is a `String` and the body must produce a `boolean`.

A **functional interface** is an interface with exactly one abstract method (the *function descriptor*). That
is the only kind of type a lambda (or a method reference) can be converted to. Default methods, static
methods and abstract methods that merely redeclare public `Object` methods (`equals`, `hashCode`,
`toString`) do **not** count.

```java
var f = x -> x;              // error: cannot infer type for local variable f (lambda needs an explicit target-type)
Object o = () -> {};         // error: Object is not a functional interface
Runnable r = () -> {};       // fine: Runnable.run() is the descriptor
```

> [!NOTE]
> Because the type comes from the context, the *same* lambda text can be a `Runnable`, a `Callable`, or a
> `Supplier` depending on where it appears. Overload resolution and generic inference both participate —
> which is why lambdas show up in so many exam questions that look like they are about something else.

## Syntax rules the compiler enforces

| Form | Legal? | Why |
|---|---|---|
| `s -> s.length()` | yes | single implicit parameter, parentheses optional |
| `(s) -> s.length()` | yes | parentheses always allowed |
| `(String s) -> s.length()` | yes | explicit type → parentheses required |
| `String s -> s.length()` | **no** | explicit type without parentheses |
| `(var a, var b) -> a + b` | yes | `var` for all parameters (Java 11+) |
| `(var a, b) -> a + b` | **no** | *cannot mix 'var' and implicitly-typed parameters* |
| `(Integer a, b) -> a + b` | **no** | *cannot mix implicitly-typed and explicitly-typed parameters* |
| `(final var s) -> s.isBlank()` | yes | modifiers/annotations need an explicit type or `var` |
| `() -> { return 1; }` | yes | block body with return |
| `x -> { x * 2; }` | **no** | *not a statement* — a block needs a statement, and `return` |
| `x -> return x * 2;` | **no** | `return` only exists inside a block body |
| `x -> { return x * 2 }` | **no** | statements inside a block still need `;` |

Two more rules:

- **Value vs void compatibility.** An expression body like `"x".length()` is compatible with both a
  value-returning descriptor (the value is returned) *and* a `void` descriptor (the value is discarded),
  because a method invocation is also a statement. `() -> "x"` is *only* value-compatible (a string literal
  is not a statement); `() -> System.out.println()` is *only* void-compatible.
- **No shadowing of locals.** A lambda body is in the same scope as the enclosing method:
  `int x = 5; IntUnaryOperator f = x -> x * 2;` fails with *variable x is already defined*.

### Effectively final capture

A lambda may read local variables of the enclosing method only if they are **final or effectively final**
(never assigned after initialization). The check looks at the *whole method*, so an assignment after the
lambda breaks it too:

```java predict
public class Main {
    public static void main(String[] args) {
        int count = 0;
        Runnable r = () -> System.out.println(count);
        count++;
        r.run();
    }
}
```
```output
Compilation fails: local variables referenced from a lambda expression must be final or effectively final
```

Fields are different: `static int base` or `this.total` can be read **and** written inside a lambda — the
lambda captures `this` (or nothing, for statics), not a copy of the value. Mutating an object that a final
local refers to (`list.add(...)`, `counter[0]++`) is also legal; only *reassigning the variable* is not.

> [!TRAP]
> The classic `for (int i = 0; i < 3; i++) { Runnable r = () -> System.out.print(i); }` does **not** compile —
> `i` is modified by `i++`. The enhanced for loop `for (String s : list) { Runnable r = () -> print(s); }`
> **does** compile: each iteration declares a fresh, effectively final `s`.

::check D6-LAM-001

### `this` in a lambda vs an anonymous class

A lambda does not introduce a new object scope: `this` means the enclosing instance, and in a static
method there is no `this` at all (*non-static variable this cannot be referenced from a static context*).
An anonymous class is a real class: `this` is the anonymous instance, and its own fields shadow outer ones.

```java predict
public class Main {
    interface Calc { int apply(int a); }
    private int base = 100;
    Calc lambda() { return a -> a + this.base; }
    Calc anon() {
        return new Calc() {
            int base = 1;
            public int apply(int a) { return a + this.base; }
        };
    }
    public static void main(String[] args) {
        Main m = new Main();
        System.out.println(m.lambda().apply(5) + " " + m.anon().apply(5));
    }
}
```
```output
105 6
```

## The java.util.function catalogue

Memorise the descriptor (method name!) of each core interface — exam code calls them directly.

| Interface | Method | Shape |
|---|---|---|
| `Supplier<T>` | `T get()` | () → T |
| `Consumer<T>` / `BiConsumer<T,U>` | `void accept(T)` / `accept(T,U)` | T → void |
| `Predicate<T>` / `BiPredicate<T,U>` | `boolean test(T)` / `test(T,U)` | T → boolean |
| `Function<T,R>` / `BiFunction<T,U,R>` | `R apply(T)` / `apply(T,U)` | T → R |
| `UnaryOperator<T>` | `T apply(T)` (extends `Function<T,T>`) | T → T |
| `BinaryOperator<T>` | `T apply(T,T)` (extends `BiFunction<T,T,T>`) | (T,T) → T |

**Primitive specializations** avoid boxing. The naming scheme is systematic:

| Pattern | Examples | Method |
|---|---|---|
| `IntXxx` takes an `int` | `IntPredicate`, `IntConsumer`, `IntFunction<R>`, `IntUnaryOperator`, `IntBinaryOperator` | `test(int)`, `accept(int)`, `apply(int)`, `applyAsInt(int)`, `applyAsInt(int,int)` |
| `ToIntXxx` returns an `int` | `ToIntFunction<T>`, `ToIntBiFunction<T,U>`, `ToDoubleFunction<T>` | `applyAsInt(T)`, `applyAsDouble(T)` |
| `XToYFunction` | `IntToLongFunction`, `DoubleToIntFunction` | `applyAsLong(int)` … |
| `ObjXConsumer` | `ObjIntConsumer<T>` | `accept(T, int)` |
| suppliers | `IntSupplier`, `DoubleSupplier`, `BooleanSupplier` | `getAsInt()`, `getAsDouble()`, `getAsBoolean()` |

> [!TRAP]
> There is no `IntToIntFunction` (that's `IntUnaryOperator`), no `BooleanPredicate`, and `BooleanSupplier`
> is the only `Boolean` specialization. `ToIntFunction<String>` is **not** a `Function<String,Integer>` —
> they are unrelated interfaces and one cannot be assigned to the other.

### Composition with default and static methods

```java predict
import java.util.function.*;
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Function<Integer, Integer> plus1 = x -> x + 1;
        Function<Integer, Integer> times2 = x -> x * 2;
        System.out.println(plus1.andThen(times2).apply(5) + " " + plus1.compose(times2).apply(5));

        Predicate<Integer> pos = n -> n > 0, even = n -> n % 2 == 0;
        System.out.println(pos.and(even).test(4) + " " + pos.or(even).test(-3) + " " + pos.negate().test(0));

        System.out.println(Stream.of("a", "", "b").filter(Predicate.not(String::isEmpty)).count());

        Consumer<StringBuilder> a = sb -> sb.append("A"), b = sb -> sb.append("B");
        StringBuilder sb = new StringBuilder();
        a.andThen(b).andThen(a).accept(sb);
        System.out.println(sb + " " + Function.<String>identity().apply("id"));
    }
}
```
```output
12 11
true false true
2
ABA id
```

- `f.andThen(g)` = "f, then g" → `g(f(x))` → `(5+1)*2 = 12`.
- `f.compose(g)` = "g first, then f" → `f(g(x))` → `5*2+1 = 11`.
- `Predicate` has `and`, `or`, `negate` (defaults) and `Predicate.not(p)` / `Predicate.isEqual(o)` (static).
- `Consumer` and `BiConsumer` have only `andThen`. `Supplier` has **no** composition methods.
- `Function.identity()` and `UnaryOperator.identity()` are static; `BinaryOperator.minBy/maxBy(comparator)` too.

### `@FunctionalInterface`

The annotation is optional; it only asks the compiler to *check* the rule. It fails on an interface with
zero or two abstract methods (*Unexpected @FunctionalInterface annotation … multiple non-overriding abstract
methods found*). It is fine with any number of `default` and `static` methods, and with abstract
redeclarations of `boolean equals(Object)`, `int hashCode()`, `String toString()` — those are implemented by
every object anyway. Careful: `Object clone()` is **protected** in Object, so an abstract `clone()` in an
interface *does* count as the single abstract method.

::check D6-LAM-002

## Method references: four kinds

A method reference is shorthand for a lambda that only calls one method. The compiler matches the
referenced method against the functional descriptor.

| Kind | Example | Equivalent lambda |
|---|---|---|
| static | `Integer::parseInt` as `Function<String,Integer>` | `s -> Integer.parseInt(s)` |
| bound (specific object) | `prefix::startsWith` as `Predicate<String>` | `s -> prefix.startsWith(s)` |
| unbound (arbitrary object of type) | `String::length` as `ToIntFunction<String>`; `String::charAt` as `BiFunction<String,Integer,Character>` | `s -> s.length()`; `(s, i) -> s.charAt(i)` |
| constructor | `ArrayList::new` as `Supplier<List<String>>` or `Function<Integer,List<String>>`; `int[]::new` as `IntFunction<int[]>` | `() -> new ArrayList<>()`; `n -> new ArrayList<>(n)`; `n -> new int[n]` |

```java predict
import java.util.*;
import java.util.function.*;
public class Main {
    public static void main(String[] args) {
        Supplier<List<String>> s = ArrayList::new;
        Function<Integer, List<String>> g = ArrayList::new;
        BiFunction<String, Integer, Character> h = String::charAt;
        String p = "hello";
        Predicate<String> q = p::startsWith;
        IntFunction<int[]> arr = int[]::new;
        System.out.println(h.apply("java", 2) + " " + q.test("he") + " " + arr.apply(3).length + " " + g.apply(10).size());
    }
}
```
```output
v true 3 0
```

`g.apply(10)` calls `new ArrayList<>(10)` — **capacity** 10, size 0. Note how `q` is bound: it asks whether
`"hello"` starts with the argument, not the other way round.

**Ambiguity.** For an unbound reference, the compiler tries both "static method taking the arguments" and
"instance method on the first argument". If both fit, the reference is ambiguous:

```java predict
import java.util.function.*;
public class Main {
    public static void main(String[] args) {
        Function<Integer, String> f = Integer::toString;
        System.out.println(f.apply(7));
    }
}
```
```output
Compilation fails: reference to toString is ambiguous
```

Both `static String toString(int)` and the instance `String toString()` match `Function<Integer,String>`.
`String::valueOf` with `Function<Object,String>` is *not* ambiguous (only static overloads exist, and the most
specific is chosen).

::check D6-LAM-003

## Target typing and overloads

When a method is overloaded with different functional interfaces, the lambda's *shape* decides:

```java predict
import java.util.function.*;
public class Main {
    static void run(Runnable r)          { System.out.println("runnable"); }
    static void run(Supplier<String> s)  { System.out.println("supplier"); }
    public static void main(String[] args) {
        run(() -> "x");
        run(() -> System.out.println());
        run(() -> { });
    }
}
```
```output
supplier
runnable
runnable
```

`() -> "x"` is only value-compatible; `System.out.println()` returns `void`, so only `Runnable` fits; an empty
block returns nothing. If a lambda fits *both* (e.g. `() -> "x".length()` with `Runnable` and
`Supplier<Integer>`), Java picks the non-`void` one as more specific (JLS §15.12.2.5).

The same mechanism decides between `Runnable` and `Callable` in `ExecutorService.submit`: a lambda whose
body throws a checked exception can only be a `Callable` (whose `call()` declares `throws Exception`).

> [!TRAP]
> Generic inference with chained calls loses the target type:
> `Comparator.comparing(s -> s.length()).reversed()` does **not** compile when sorting strings — the lambda is
> typed before `.reversed()` is applied, so `s` is inferred as `Object` (*cannot find symbol: method
> length()*). Fix with a method reference `Comparator.comparing(String::length).reversed()` or an explicit
> parameter type `(String s) -> s.length()`.

## What if…? One change at a time

| Change | Result |
|---|---|
| `x -> x * 2` → `(var x) -> x * 2` | still compiles |
| `(a, b) -> a + b` → `(var a, b) -> a + b` | error: cannot mix 'var' and implicitly-typed parameters |
| `() -> { return 1; }` → `() -> { 1; }` | error: not a statement |
| Captured local reassigned *after* the lambda | error: must be final or effectively final |
| Captured variable is a field instead of a local | compiles; the lambda sees the latest value |
| `Supplier<String> s = () -> { return; };` | error: bad return type — missing return value |
| `@FunctionalInterface` interface also declares `String toString();` | still functional |
| `Function<Integer,String> f = Integer::toString` | error: ambiguous method reference |

## Exam traps checklist

> [!TRAP]
> - `Predicate<String> p = s -> s.isEmpty();` — the method is `test`, not `apply`. Calling `p.apply("")` does not compile.
> - `UnaryOperator<T>` extends `Function<T,T>` — so it *is* a `Function`, and its method is `apply`.
> - Lambdas in a static method cannot use `this`.
> - A lambda's parameter name may not clash with a local variable in scope, but it *may* shadow a field.
> - `int[] counter = {0}; Runnable r = () -> counter[0]++;` compiles: the array reference is effectively final.

## Practice

Before the mastery quiz, say out loud the descriptor of every interface in the catalogue table, then try
this mixed question:

::check D6-LAM-004
