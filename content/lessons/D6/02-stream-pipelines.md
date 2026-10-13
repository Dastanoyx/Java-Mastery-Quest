---
id: streams-pipelines
domain: D6
order: 2
title: Stream Pipelines, Laziness, Optional & Primitive Streams
summary: How a stream pipeline really executes — sources, lazy intermediate operations, element-by-element (vertical) processing, short-circuiting, stateful barriers like sorted — plus terminal operations, Optional, primitive streams and the single-use rule.
minutes: 60
objectives: [D6.1]
prerequisites: [streams-lambdas]
contract:
  - Create streams from values, arrays, collections, strings, iterate (with and without a predicate), generate and IntStream ranges.
  - Trace a pipeline with peek/print statements and predict the exact interleaving of output, including short-circuiting and sorted() as a barrier.
  - Choose the right terminal operation and state its return type (count → long, min/max → Optional, average → OptionalDouble, toList → unmodifiable List).
  - Use the Optional API correctly, including the evaluation difference between orElse and orElseGet.
  - Recognise runtime failures of stream code (IllegalStateException on reuse, UnsupportedOperationException on toList(), NoSuchElementException on empty Optional).
keyRules:
  - Intermediate operations are lazy; nothing runs until a terminal operation is invoked.
  - "Elements flow one at a time through the whole pipeline (vertical processing), except across stateful operations such as sorted(), which must see every element first."
  - "Short-circuiting operations (limit, findFirst, findAny, anyMatch, allMatch, noneMatch, takeWhile) can stop the source early — even an infinite one."
  - A stream can be consumed only once; a second operation on the same stream object throws IllegalStateException.
  - "On an empty stream: allMatch and noneMatch return true, anyMatch returns false."
  - "Stream.toList() returns an unmodifiable list; Collectors.toList() makes no guarantee but currently returns a mutable ArrayList."
  - "Optional.of(null) throws NullPointerException; Optional.ofNullable(null) is empty; get()/orElseThrow() on empty throw NoSuchElementException."
  - "orElse(x) always evaluates x; orElseGet(supplier) calls the supplier only when the Optional is empty."
  - "IntStream.sum() returns int, average() returns OptionalDouble, max()/min() return OptionalInt; Stream<T> has no sum() and its max/min need a Comparator."
retrieval:
  - Draw the execution order of `Stream.of(3,1,2).peek(a).sorted().peek(b).limit(1).forEach(c)` from memory.
  - Write down the return type of count, min, findFirst, average (on IntStream), sum (on IntStream), toList and collect(Collectors.toList()).
  - Explain why `Stream.iterate(1, n -> n + 1).sorted().limit(3)` never finishes but `filter(...).limit(3)` does.
checks: []
mastery: [D6-PIP-005, D6-PIP-006, D6-PIP-007, D6-PIP-008, D6-PIP-009]
---

## Mental model: a pipeline is a recipe, not a loop

A stream is **not a data structure**. It is a description of a computation: a **source**, zero or more
**intermediate operations** (each returns a new `Stream`) and exactly one **terminal operation**. Building
the pipeline does no work at all — it only records the steps. The terminal operation pulls elements from the
source and pushes each one through the chain.

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Stream.of("a", "b", "c").peek(System.out::print).map(String::toUpperCase);
        System.out.println("done");
    }
}
```
```output
done
```

No terminal operation, so `peek` never runs. This is the single most-tested stream fact.

### Creating streams

| Source | Example | Notes |
|---|---|---|
| values | `Stream.of("a", "b")`, `Stream.empty()` | `Stream.of(int[])` gives a `Stream<int[]>` with ONE element |
| arrays | `Arrays.stream(arr)`, `Arrays.stream(arr, from, to)` | `int[]` → `IntStream`; range is half-open |
| collections | `list.stream()`, `list.parallelStream()` | `Map` has no `stream()` — use `entrySet().stream()` |
| strings | `"abc".chars()` | an `IntStream` of char codes (`97 98 99`) |
| infinite | `Stream.iterate(1, n -> n * 2)`, `Stream.generate(() -> "z")` | must be cut off with `limit`/short-circuit |
| bounded iterate | `Stream.iterate(1, n -> n < 20, n -> n * 3)` | like a for loop: `1 3 9` |
| ranges | `IntStream.range(1, 4)` (1,2,3), `IntStream.rangeClosed(1, 4)` (1..4) | also on `LongStream` |

## Execution order: vertical, lazy, short-circuiting

Each element travels through **all** stages before the next element enters. Filtered-out elements stop early:

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Stream.of("x", "yy", "zzz")
            .peek(s -> System.out.print("p:" + s + " "))
            .filter(s -> s.length() > 1)
            .map(s -> { System.out.print("m:" + s + " "); return s.length(); })
            .forEach(n -> System.out.print("f:" + n + " "));
    }
}
```
```output
p:x p:yy m:yy f:2 p:zzz m:zzz f:3
```

**Short-circuiting** stops pulling from the source once the answer is known, so infinite streams can
terminate:

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Stream.iterate(1, n -> n * 2)
            .peek(n -> System.out.print(n + " "))
            .filter(n -> n > 5)
            .findFirst()
            .ifPresent(n -> System.out.println("-> " + n));
    }
}
```
```output
1 2 4 8 -> 8
```

**Stateful operations are barriers.** `sorted()` cannot emit anything until it has seen every element, so
all upstream work happens first, then the elements continue one at a time:

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Stream.of(5, 3, 1, 4)
            .peek(n -> System.out.print("a" + n + " "))
            .sorted()
            .peek(n -> System.out.print("b" + n + " "))
            .limit(2)
            .forEach(n -> System.out.print("c" + n + " "));
    }
}
```
```output
a5 a3 a1 a4 b1 c1 b3 c3
```

> [!TRAP]
> `Stream.iterate(1, n -> n + 1).sorted().limit(3)` **hangs** (and eventually fails with
> `OutOfMemoryError`): `sorted()` waits for an infinite source to end before `limit` can act. With `filter`
> instead of `sorted` the same pipeline prints three elements, because `filter` is stateless.

::check D6-PIP-001

### Intermediate operations to know cold

| Operation | Notes |
|---|---|
| `filter(Predicate)` | keeps matching elements |
| `map(Function)` / `mapToInt(ToIntFunction)` / `mapToObj` / `boxed()` | change element type; `boxed()` turns `IntStream` into `Stream<Integer>` |
| `flatMap(Function<T, Stream<R>>)` | replaces each element by a stream and flattens |
| `distinct()` | uses `equals`/`hashCode`; stateful |
| `sorted()` / `sorted(Comparator)` | natural order needs `Comparable` — otherwise `ClassCastException` **at runtime** |
| `skip(n)` / `limit(n)` | `limit` short-circuits |
| `takeWhile(p)` / `dropWhile(p)` | take/drop the **prefix** while `p` is true — stop at the first failure (not a filter!) |
| `peek(Consumer)` | for debugging; runs only when elements flow |

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Stream.of(1, 2, 3, 4, 1, 5).takeWhile(n -> n < 3).forEach(System.out::print);
        System.out.println();
        Stream.of(1, 2, 3, 4, 1, 5).dropWhile(n -> n < 3).forEach(System.out::print);
        System.out.println();
        Stream.of(1, 2, 3, 4, 1, 5).filter(n -> n < 3).forEach(System.out::print);
    }
}
```
```output
12
3415
121
```

## Terminal operations and their return types

| Terminal operation | Returns | On an empty stream |
|---|---|---|
| `forEach(Consumer)` | `void` | does nothing |
| `count()` | `long` | `0` |
| `min(Comparator)` / `max(Comparator)` | `Optional<T>` | `Optional.empty` |
| `findFirst()` / `findAny()` | `Optional<T>` | `Optional.empty` |
| `anyMatch` / `allMatch` / `noneMatch` | `boolean` | `false` / **`true`** / **`true`** |
| `reduce(...)` / `collect(...)` | see next mission | |
| `toList()` (Java 16+) | **unmodifiable** `List<T>` | empty list |
| `toArray()` / `toArray(String[]::new)` | `Object[]` / typed array | |

```java predict
import java.util.*;
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        List<Integer> mutable = Stream.of(1, 2).collect(Collectors.toList());
        mutable.add(3);
        System.out.println(mutable);
        List<Integer> fixed = Stream.of(1, 2).toList();
        fixed.add(3);
    }
}
```
```output
[1, 2, 3]
Exception in thread "main" java.lang.UnsupportedOperationException
```

> [!NOTE] Beyond the exam
> `count()` may skip executing the pipeline when it can compute the size directly from the source:
> `List.of(1,2,3).stream().peek(print).count()` prints nothing and returns 3. Add a `filter` and the peeks
> run. Never rely on side effects inside a pipeline that ends with `count()`.

### Streams are single-use

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Stream<String> s = Stream.of("a", "b");
        s.filter(x -> true);
        System.out.println(s.count());
    }
}
```
```output
Exception in thread "main" java.lang.IllegalStateException: stream has already been operated upon or closed
```

Calling `filter` *linked* `s` to a new stage — even though that stage was thrown away, `s` is now consumed.

::check D6-PIP-002

## Optional: a box that may be empty

| Method | Behaviour |
|---|---|
| `Optional.of(v)` | `NullPointerException` if `v` is null |
| `Optional.ofNullable(v)` / `Optional.empty()` | empty if null |
| `get()` / `orElseThrow()` | value, or `NoSuchElementException: No value present` |
| `orElse(x)` | value or `x` — **`x` is always evaluated** |
| `orElseGet(supplier)` | supplier runs only if empty |
| `orElseThrow(Supplier<X>)` | throws your exception if empty |
| `map(f)` | empty stays empty; if `f` returns `null` the result is empty |
| `flatMap(f)` | `f` returns an `Optional` — no nesting |
| `filter(p)` | empty if the predicate fails |
| `ifPresent(c)` / `ifPresentOrElse(c, r)` | side effects |
| `isPresent()` / `isEmpty()` / `or(supplier)` / `stream()` | |

```java predict
import java.util.*;
public class Main {
    static String fallback() { System.out.print("[fb]"); return "fb"; }
    public static void main(String[] args) {
        Optional<String> o = Optional.of("v");
        System.out.println(o.orElse(fallback()));
        System.out.println(o.orElseGet(Main::fallback));
        System.out.println(Optional.of("abc").filter(s -> s.length() > 5));
        System.out.println(Optional.of("abc").map(String::length));
        Optional.empty().ifPresentOrElse(x -> System.out.println("has"), () -> System.out.println("empty"));
    }
}
```
```output
[fb]v
v
Optional.empty
Optional[3]
empty
```

`orElse(fallback())` is an ordinary method argument: Java evaluates it before calling `orElse`, so `[fb]`
prints even though the value is present.

## Primitive streams

`IntStream`, `LongStream` and `DoubleStream` avoid boxing and add arithmetic terminals:

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        System.out.println(IntStream.of(4, 8, 6).average());
        System.out.println(IntStream.empty().average());
        System.out.println(IntStream.rangeClosed(1, 4).sum() + " " + IntStream.range(1, 4).sum());
        System.out.println(IntStream.of(3, 1, 2).summaryStatistics());
        System.out.println(Stream.of("a", "bb").mapToInt(String::length).max().getAsInt());
    }
}
```
```output
OptionalDouble[6.0]
OptionalDouble.empty
10 6
IntSummaryStatistics{count=3, sum=6, min=1, average=2.000000, max=3}
2
```

- `sum()` returns `int` (0 when empty) — **not** an Optional. `average()` always returns `OptionalDouble`.
- `max()`/`min()` on `IntStream` take **no** comparator and return `OptionalInt`; `getAsInt()` unwraps it.
- `Stream<Integer>` has no `sum()` (*cannot find symbol*); convert with `mapToInt(Integer::intValue)`.
- `double avg = IntStream.of(1, 2).average();` does not compile: `OptionalDouble cannot be converted to double`.
- Convert back with `boxed()` or `mapToObj(...)`; between primitive types with `asLongStream()`, `asDoubleStream()`, `mapToLong` …

::check D6-PIP-003

## What if…? One change at a time

| Change | Result |
|---|---|
| Remove the terminal operation | nothing in the pipeline runs |
| `findFirst()` → `findAny()` on a sequential stream | in practice same result, but not guaranteed by the spec |
| `Stream.of(1,2).max()` with no comparator | compile error — `Stream.max` requires a `Comparator` |
| `sorted()` on objects that are not `Comparable` | compiles; `ClassCastException` when the terminal op runs |
| `toList()` → `collect(Collectors.toList())`, then `add` | works instead of `UnsupportedOperationException` |
| `IntStream.range(1, 4)` → `rangeClosed(1, 4)` | includes 4 |
| `orElse(compute())` → `orElseGet(() -> compute())` | `compute()` no longer runs when a value is present |
| Modify the source list *before* the terminal op | the stream sees the change (late binding) |
| Modify the source list *inside* `forEach` | `ConcurrentModificationException` |

## Exam traps checklist

> [!TRAP]
> - `count()` returns `long`; assigning it to `int` without a cast does not compile.
> - `Stream.empty().allMatch(x -> false)` is `true` — "every element of nothing" is vacuously true.
> - `"abc".chars()` produces ints. `forEach(System.out::print)` prints `979899`; use `mapToObj(c -> (char) c)` for letters.
> - `peek` is intermediate; `forEach` is terminal and returns `void`, so nothing can be chained after it.
> - `Optional.get()` on empty throws `NoSuchElementException`, not `NullPointerException`.

## Practice

::check D6-PIP-004
