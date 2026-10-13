---
id: streams-collectors
domain: D6
order: 3
title: Reduction, Collectors, Grouping & Parallel Streams
summary: Turn a stream into one result — the three reduce forms and their identity rules, the Collectors toolbox (toMap, joining, groupingBy, partitioningBy, mapping, filtering, flatMapping, collectingAndThen, teeing), decomposition and concatenation, and what changes when the stream runs in parallel.
minutes: 65
objectives: [D6.2]
prerequisites: [streams-pipelines]
contract:
  - Predict the result of each reduce overload, including the Optional form and the effect of a wrong identity on a parallel stream.
  - Build maps with toMap (with and without merge function and map supplier) and explain the duplicate-key IllegalStateException.
  - Group and partition with 1-, 2- and 3-argument groupingBy and partitioningBy, combined with downstream collectors.
  - Decompose nested data with flatMap and combine streams with Stream.concat.
  - State which parallel-stream results are deterministic and which are not (forEach vs forEachOrdered, findAny, non-associative reduce, stateful lambdas).
keyRules:
  - "reduce(identity, op) returns T; reduce(op) returns Optional<T>; reduce(identity, accumulator, combiner) returns U and is the only form that can change the result type."
  - "The identity must satisfy op(identity, x) == x, and op must be associative — otherwise a parallel run gives a different answer."
  - "toMap without a merge function throws IllegalStateException (Duplicate key …) on a repeated key."
  - groupingBy(classifier) returns a Map<K, List<T>> (currently a HashMap); the 3-arg form takes a map factory such as TreeMap::new before the downstream collector.
  - "partitioningBy always produces both keys, false and true, even when one partition is empty."
  - counting() produces Long, averagingX() produces Double, summingInt() produces Integer.
  - "Parallel: forEach order is unspecified, forEachOrdered keeps encounter order; collect/toList/findFirst/reduce with an associative op keep deterministic results."
retrieval:
  - Write the signatures of the three reduce methods and say which one returns an Optional.
  - From memory, list the downstream collectors that change element values (mapping), drop elements (filtering), and expand elements (flatMapping).
  - Explain why `parallelStream().reduce(0, (a, b) -> a - b)` is wrong even if it happens to print the "right" number.
checks: []
mastery: [D6-COL-005, D6-COL-006, D6-COL-007, D6-COL-008, D6-COL-009]
---

## Mental model: folding many into one

A **reduction** combines all elements into one result: a sum, a string, a list, a map. Java gives you two
tools:

- `reduce` — *immutable* reduction: each step produces a **new** value (`a + b`, `s1 + s2`).
- `collect` — *mutable* reduction: elements are added to a **container** (`ArrayList`, `StringBuilder`,
  `HashMap`). `Collectors` is a factory of ready-made recipes for `collect`.

Both are designed so that the work can be split into chunks, each chunk reduced independently, and the
partial results combined. That is why the rules about identity and associativity exist — they are what make
a reduction safe to run in parallel.

## reduce: three forms

```java
T            reduce(T identity, BinaryOperator<T> accumulator)
Optional<T>  reduce(BinaryOperator<T> accumulator)
<U> U        reduce(U identity, BiFunction<U, ? super T, U> accumulator, BinaryOperator<U> combiner)
```

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        System.out.println(Stream.of(1, 2, 3).reduce(10, Integer::sum));
        System.out.println(Stream.of(1, 2, 3).reduce(Integer::sum));
        System.out.println(Stream.<Integer>empty().reduce(Integer::sum));
        System.out.println(Stream.of("ab", "cde").reduce(0, (acc, s) -> acc + s.length(), Integer::sum));
    }
}
```
```output
16
Optional[6]
Optional.empty
5
```

- With an identity, the result is never empty — an empty stream returns the identity itself.
- Without one, the result must be `Optional`, because there may be nothing to return.
- The 3-argument form is needed to go from `Stream<String>` to an `Integer`. The 2-argument form with an
  `int` identity on a `Stream<String>` **does not compile** (*no suitable method found for reduce*).

> [!TRAP]
> `reduce(10, Integer::sum)` adds 10 **once** sequentially (16). In parallel the identity is used once per
> chunk, so `Stream.of(1,2,3,4).parallel().reduce(10, Integer::sum)` returns `50` on a typical machine
> instead of `20`. An identity must be neutral: `0` for `+`, `1` for `*`, `""` for concatenation.

## collect with Collectors

| Collector | Result |
|---|---|
| `toList()`, `toSet()`, `toCollection(TreeSet::new)` | containers |
| `joining()`, `joining(", ")`, `joining(", ", "[", "]")` | `String`; prefix/suffix are added even for an empty stream → `[]` |
| `counting()` | `Long` |
| `summingInt(f)` / `averagingInt(f)` / `averagingDouble(f)` | `Integer` / `Double` / `Double` |
| `minBy(cmp)` / `maxBy(cmp)` | `Optional<T>` |
| `summarizingInt(f)` | `IntSummaryStatistics` |
| `mapping(f, downstream)` / `filtering(p, downstream)` / `flatMapping(f, downstream)` | adapt a downstream collector |
| `collectingAndThen(downstream, finisher)` | post-process the result |
| `teeing(c1, c2, merger)` (Java 12) | run two collectors, merge their results |
| `reducing(identity, mapper, op)` | reduce as a collector |

### toMap and duplicate keys

```java predict
import java.util.*;
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        var merged = Stream.of("aa", "b", "cc")
            .collect(Collectors.toMap(String::length, s -> s, (x, y) -> x + "+" + y, TreeMap::new));
        System.out.println(merged);
        Map<Integer, String> broken = Stream.of("aa", "b", "cc")
            .collect(Collectors.toMap(String::length, s -> s));
        System.out.println(broken);
    }
}
```
```output
{1=b, 2=aa+cc}
Exception in thread "main" java.lang.IllegalStateException: Duplicate key 2 (attempted merging values aa and cc)
```

`toMap(keyMapper, valueMapper)` refuses duplicates; `toMap(k, v, merge)` resolves them; `toMap(k, v, merge,
mapFactory)` also chooses the map type. (A `null` value from the value mapper causes a
`NullPointerException` — `HashMap.merge` does not accept null values.)

::check D6-COL-001

### groupingBy and partitioningBy

```java predict
import java.util.*;
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        List<String> words = List.of("ant", "bee", "cat", "ape", "bat");
        System.out.println(words.stream().collect(Collectors.groupingBy(String::length)));
        Map<Character, Long> counts = words.stream().collect(
            Collectors.groupingBy(s -> s.charAt(0), TreeMap::new, Collectors.counting()));
        System.out.println(counts);
        Map<Character, String> joined = words.stream().collect(
            Collectors.groupingBy(s -> s.charAt(0), TreeMap::new,
                Collectors.mapping(String::toUpperCase, Collectors.joining("|"))));
        System.out.println(joined);
        Map<Character, List<String>> endsWithE = words.stream().collect(
            Collectors.groupingBy(s -> s.charAt(0), TreeMap::new,
                Collectors.filtering(s -> s.endsWith("e"), Collectors.toList())));
        System.out.println(endsWithE);
        System.out.println(words.stream().collect(Collectors.partitioningBy(s -> s.startsWith("z"))));
    }
}
```
```output
{3=[ant, bee, cat, ape, bat]}
{a=2, b=2, c=1}
{a=ANT|APE, b=BEE|BAT, c=CAT}
{a=[ape], b=[bee], c=[]}
{false=[ant, bee, cat, ape, bat], true=[]}
```

Things to notice:

- 1-arg `groupingBy` → `Map<K, List<T>>`; 2-arg adds a downstream collector; 3-arg is
  `(classifier, mapFactory, downstream)` — the factory sits **in the middle**.
- `filtering` keeps the key `c` with an empty list. A `filter(...)` *before* `groupingBy` would remove the
  key entirely.
- `partitioningBy` always has both `false` and `true` keys; its map lists `false` first.
- The results are assigned to typed variables on purpose. Passing a 3-argument `groupingBy(..., TreeMap::new, ...)`
  result straight into an overloaded method such as `println` can defeat javac's type inference (verified on
  JDK 25: *inference variable R has incompatible bounds*). Giving the expression a target type fixes it.

> [!TRAP]
> Printing a `groupingBy` result without `TreeMap::new` relies on `HashMap` iteration order. For small
> `Integer`/`Character`/`Boolean` keys the order happens to look sorted, but the API makes no promise. On the
> exam, assume the order shown only if the question makes it deterministic.

### collectingAndThen and teeing

```java predict
import java.util.*;
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        List<Integer> ro = Stream.of(3, 1, 2)
            .collect(Collectors.collectingAndThen(Collectors.toList(), Collections::unmodifiableList));
        System.out.println(ro);
        String stats = Stream.of(1, 2, 3, 4)
            .collect(Collectors.teeing(Collectors.counting(), Collectors.summingInt(x -> x),
                                       (count, sum) -> sum + "/" + count));
        System.out.println(stats);
        System.out.println(Stream.of(1, 2, 3, 4).collect(Collectors.averagingInt(x -> x)));
    }
}
```
```output
[3, 1, 2]
10/4
2.5
```

::check D6-COL-002

## Decomposition and concatenation

**flatMap** turns "one element → many elements" into a flat stream. Typical decompositions: nested lists,
words in sentences, characters in strings.

```java predict
import java.util.*;
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        System.out.println(Stream.of(List.of(1, 2), List.of(3), List.<Integer>of())
            .flatMap(List::stream).toList());
        System.out.println(Stream.of("to be", "or not")
            .flatMap(line -> Arrays.stream(line.split(" "))).toList());
        System.out.println(Stream.concat(Stream.of("x"), Stream.of("y", "z")).toList());
        System.out.println(Stream.of(List.of("p", "q"), List.of("r"))
            .collect(Collectors.flatMapping(List::stream, Collectors.joining())));
    }
}
```
```output
[1, 2, 3]
[to, be, or, not]
[x, y, z]
pqr
```

`Stream.concat(a, b)` is a **static** method taking exactly two streams; it consumes both. For primitives use
`IntStream.concat`. An empty list contributes nothing to `flatMap`.

::check D6-COL-003

## Parallel streams

`collection.parallelStream()` or `stream.parallel()` splits the work across the common fork/join pool. The
*whole* pipeline is either parallel or sequential — the last call to `parallel()`/`sequential()` wins.

What stays deterministic:

- `toList()`, `collect(...)`, `forEachOrdered`, `findFirst`, `reduce` with an associative operator and a
  true identity — the result respects encounter order.

What does **not**:

- `forEach` — elements are printed in whatever order threads reach them.
- `findAny` — may return any matching element.
- `reduce` with a non-associative operator (`a - b`, string building with a non-neutral identity).
- Lambdas that mutate shared state (`list::add` on an `ArrayList`) — lost updates, exceptions, or
  `ArrayIndexOutOfBoundsException`.

```java predict
import java.util.*;
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        List.of(1, 2, 3, 4, 5).parallelStream().map(x -> x * 10)
            .forEachOrdered(x -> System.out.print(x + " "));
        System.out.println();
        System.out.println(List.of(1, 2, 3, 4, 5).parallelStream().map(x -> x * 10).toList());
        System.out.println(IntStream.rangeClosed(1, 100).parallel().filter(x -> x % 7 == 0).findFirst().getAsInt());
        System.out.println(Stream.of("a", "b", "c", "d").parallel().reduce("", String::concat));
    }
}
```
```output
10 20 30 40 50
[10, 20, 30, 40, 50]
7
abcd
```

String concatenation is associative and `""` is a true identity, so even in parallel the result is `abcd`.
Replace the identity with `"_"` and you get a different string in parallel than sequentially.

> [!TRAP]
> "It printed the right answer when I ran it" proves nothing for a parallel stream. Exam questions about
> `parallel().forEach(...)` or `findAny()` usually have the answer "the output is not predictable" — pick
> that option when the code depends on ordering or on a non-associative operation.

::check D6-COL-004

## What if…? One change at a time

| Change | Result |
|---|---|
| `toMap(k, v)` with a duplicate key | `IllegalStateException: Duplicate key …` |
| add a merge function `(a, b) -> a` | first value wins, no exception |
| `groupingBy(f)` → `groupingBy(f, counting())` | values become `Long` counts |
| `filter` before `groupingBy` → `filtering` downstream | empty groups keep their key |
| `partitioningBy` on an empty stream | `{false=[], true=[]}` |
| `reduce(0, (a, b) -> a - b)` sequential → parallel | result may change (non-associative) |
| `forEach` → `forEachOrdered` on a parallel stream | encounter order restored |
| `Integer x = stream.collect(counting())` | compile error — `counting()` yields `Long` |

## Exam traps checklist

> [!TRAP]
> - `joining` works only on `CharSequence` elements: map numbers to strings first.
> - `averagingInt` returns `Double` even for whole numbers (`2.5`, but also `3.0`).
> - `groupingBy(f, TreeMap::new)` does not compile — the map factory needs the downstream argument too.
> - `Collectors.toList()` vs `Stream.toList()`: only the first gives you a list you can `add` to (today).
> - `reduce(BinaryOperator)` returns `Optional`; printing it shows `Optional[6]`, not `6`.
