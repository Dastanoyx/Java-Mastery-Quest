---
id: streams-gatherers
domain: D6
order: 4
title: Stream Gatherers (Java 24+) — Custom Intermediate Operations
summary: Stream.gather lets you plug your own intermediate operation into a pipeline. Learn the built-in Gatherers (windowFixed, windowSliding, fold, scan, mapConcurrent), how a Gatherer is put together (initializer, integrator, combiner, finisher), and how to write a simple one with Gatherer.ofSequential and Gatherer.of.
minutes: 45
objectives: [D6.2]
prerequisites: [streams-collectors]
contract:
  - Predict the exact output of windowFixed, windowSliding, fold, scan and mapConcurrent, including edge cases (short last window, stream shorter than the window, empty stream).
  - Explain the four parts of a Gatherer and what the boolean returned by an integrator means.
  - Write a stateful sequential Gatherer with Gatherer.ofSequential and a stateless one with Gatherer.of.
  - Contrast gather (intermediate, element-to-elements) with collect (terminal, elements-to-result).
keyRules:
  - "Stream Gatherers are final since Java 24 (JEP 485): `stream.gather(gatherer)` is an intermediate operation returning Stream<R>."
  - "windowFixed(n) emits unmodifiable List<T> windows of n elements; the last window may be shorter. n < 1 throws IllegalArgumentException."
  - "windowSliding(n) emits overlapping windows advancing by one; if the stream has fewer than n elements, one window with all of them is emitted (none for an empty stream)."
  - "fold(initial, folder) emits exactly one element at the end — even for an empty stream (the initial value). scan(initial, scanner) emits every intermediate accumulation, not the initial value."
  - mapConcurrent(maxConcurrency, mapper) runs the mapper on virtual threads but emits results in encounter order.
  - "An integrator returns true to ask for more elements and false to stop (short-circuit); downstream.push(x) returns false when downstream wants no more."
retrieval:
  - Write the output of windowFixed(2), windowSliding(2), fold and scan (sum) for the stream 1, 2, 3.
  - Name the four functions that make up a Gatherer and say which ones are optional.
  - Explain the difference between `Gatherers.fold` and `Stream.reduce` in terms of return type.
checks: []
mastery: [D6-GAT-004, D6-GAT-005, D6-GAT-006, D6-GAT-007]
---

## Mental model: collect for the middle of a pipeline

Before Java 24, if you needed an intermediate operation the API did not offer — "group into pairs",
"running total", "drop consecutive duplicates" — you had to leave the stream, use a loop or a collector, and
start a new stream. A **Gatherer** is to intermediate operations what a `Collector` is to terminal ones: a
small object that describes how to transform a stream of `T` into a stream of `R`, possibly with state.

> [!J25]
> Stream Gatherers were previewed in Java 22 and 23 and are **final since Java 24 (JEP 485)**, so they are
> standard API in Java 25: `Stream.gather(Gatherer)`, the interface `java.util.stream.Gatherer`, and the
> factory class `java.util.stream.Gatherers`.

`gather` can do anything `map`, `filter`, `flatMap`, `limit` or `takeWhile` do — one-to-one, one-to-zero,
one-to-many, many-to-one, and short-circuiting — while keeping state between elements.

## The built-in gatherers

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        System.out.println(Stream.of(1, 2, 3, 4, 5).gather(Gatherers.windowFixed(2)).toList());
        System.out.println(Stream.of(1, 2, 3, 4, 5).gather(Gatherers.windowSliding(3)).toList());
        System.out.println(Stream.of(1, 2).gather(Gatherers.windowSliding(3)).toList());
        System.out.println(Stream.of(1, 2, 3, 4).gather(Gatherers.fold(() -> 0, Integer::sum)).toList());
        System.out.println(Stream.of(1, 2, 3, 4).gather(Gatherers.scan(() -> 0, Integer::sum)).toList());
        System.out.println(Stream.of("a", "b", "c").gather(Gatherers.scan(() -> "", String::concat)).toList());
    }
}
```
```output
[[1, 2], [3, 4], [5]]
[[1, 2, 3], [2, 3, 4], [3, 4, 5]]
[[1, 2]]
[10]
[1, 3, 6, 10]
[a, ab, abc]
```

| Gatherer | Emits | Edge cases |
|---|---|---|
| `windowFixed(n)` | consecutive non-overlapping `List<T>` of size n | last window may be shorter; `n < 1` → `IllegalArgumentException: 'windowSize' must be greater than zero` |
| `windowSliding(n)` | overlapping windows, step 1 | fewer than n elements → one window with all of them; empty stream → no window |
| `fold(Supplier<R> initial, BiFunction<R,T,R>)` | **one** result, at the end | empty stream → emits the initial value |
| `scan(Supplier<R> initial, BiFunction<R,T,R>)` | each running result | the initial value itself is **not** emitted; empty → nothing |
| `mapConcurrent(int max, Function<T,R>)` | mapped values **in encounter order** | runs up to `max` mappers at once on virtual threads |

The windows are **unmodifiable** lists: `windows.get(0).add(9)` throws `UnsupportedOperationException`.

> [!TRAP]
> `fold` is not a terminal operation — it returns a `Stream<R>` with a single element. You still need
> `findFirst()`, `toList()` etc. Compare: `reduce(0, Integer::sum)` returns an `Integer` directly, and
> `reduce(Integer::sum)` returns `Optional.empty` for an empty stream, whereas `fold` emits the initial value.

::check D6-GAT-001

### Gatherers are still lazy and vertical

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        Stream.of(1, 2, 3, 4, 5)
            .peek(n -> System.out.print("in" + n + " "))
            .gather(Gatherers.windowFixed(2))
            .forEach(w -> System.out.print(w + " "));
    }
}
```
```output
in1 in2 [1, 2] in3 in4 [3, 4] in5 [5]
```

A window is pushed downstream as soon as it is full; the final partial window is emitted by the
gatherer's *finisher*, after the source is exhausted.

### mapConcurrent keeps order

```java predict
import java.util.stream.*;
public class Main {
    public static void main(String[] args) {
        var out = Stream.of(3, 1, 2)
            .gather(Gatherers.mapConcurrent(4, x -> {
                try { Thread.sleep(x * 20L); } catch (InterruptedException e) { }
                return x * 10;
            }))
            .toList();
        System.out.println(out);
    }
}
```
```output
[30, 10, 20]
```

Although `1` finishes first, results are emitted in the original order. This makes `mapConcurrent` a
deterministic way to run blocking I/O-style calls concurrently — unlike `parallel().map(...).forEach(...)`.

::check D6-GAT-002

## Anatomy of a Gatherer

`Gatherer<T, A, R>` — input `T`, private state `A`, output `R` — is made of up to four functions:

| Part | Type | Role | Default |
|---|---|---|---|
| initializer | `Supplier<A>` | creates the state | no state |
| **integrator** | `Integrator<A, T, R>` → `boolean integrate(A state, T element, Downstream<? super R> downstream)` | handles each element; may `push` 0..n results | *required* |
| combiner | `BinaryOperator<A>` | merges states in parallel | sequential only |
| finisher | `BiConsumer<A, Downstream<? super R>>` | runs after the last element; may push more | nothing |

The integrator's return value is the short-circuit signal: `true` = "send me more", `false` = "I'm done".
`downstream.push(x)` itself returns `false` when the rest of the pipeline no longer wants elements, so the
idiom `return downstream.push(x);` propagates short-circuiting.

Factory methods:

- `Gatherer.ofSequential(integrator)`, `ofSequential(initializer, integrator)`,
  `ofSequential(initializer, integrator, finisher)` — never run in parallel, no combiner needed.
- `Gatherer.of(integrator)` (stateless, parallelizable) and `Gatherer.of(initializer, integrator, combiner, finisher)`.
- `Gatherer.Integrator.ofGreedy(...)` marks an integrator that never short-circuits (a hint for optimisation).
- `g1.andThen(g2)` composes two gatherers.

```java predict
import java.util.*;
import java.util.stream.*;
public class Main {
    static <T> Gatherer<T, ?, T> distinctConsecutive() {
        return Gatherer.ofSequential(
            () -> new Object[1],                          // state: last element seen
            (state, element, downstream) -> {
                if (!Objects.equals(state[0], element)) {
                    state[0] = element;
                    return downstream.push(element);
                }
                return true;                              // skip, but keep going
            });
    }
    public static void main(String[] args) {
        System.out.println(Stream.of(1, 1, 2, 2, 2, 1, 3).gather(distinctConsecutive()).toList());

        Gatherer<Integer, int[], Integer> firstTwo = Gatherer.ofSequential(
            () -> new int[1],
            (count, e, down) -> count[0]++ < 2 ? down.push(e) : false);
        System.out.println(Stream.of(5, 6, 7, 8).peek(x -> System.out.print("p" + x + " "))
            .gather(firstTwo).toList());

        Gatherer<Integer, int[], Integer> sumAtEnd = Gatherer.ofSequential(
            () -> new int[1],
            (acc, e, down) -> { acc[0] += e; return true; },
            (acc, down) -> down.push(acc[0]));
        System.out.println(Stream.of(1, 2, 3).gather(sumAtEnd).toList());
    }
}
```
```output
[1, 2, 1, 3]
p5 p6 p7 [5, 6]
[6]
```

`firstTwo` returns `false` on the third element, so the source stops — `p8` is never printed. Note that the
third element (`7`) *was* pulled and peeked before the integrator refused it.

> [!NOTE] Beyond the exam
> Unlike `distinct()`, the custom `distinctConsecutive` removes only *adjacent* duplicates and needs O(1)
> memory. Real-world gatherers like this replace many hand-written loops in log and event processing.

::check D6-GAT-003

## What if…? One change at a time

| Change | Result |
|---|---|
| `windowFixed(2)` → `windowFixed(4)` on 6 elements | `[[1,2,3,4],[5,6]]` |
| `windowSliding(3)` on 2 elements | `[[1, 2]]` (one short window) |
| `windowSliding(3)` on an empty stream | `[]` |
| `fold` on an empty stream | `[initial]` |
| `scan` on an empty stream | `[]` |
| integrator returns `false` | upstream stops after the current element |
| `windowFixed(0)` | `IllegalArgumentException` when the gatherer is created |
| `mapConcurrent` with a mapper that throws | the exception propagates from the terminal operation |

## Exam traps checklist

> [!TRAP]
> - `gather` is **intermediate**: `Stream.of(...).gather(...)` alone does nothing.
> - The class is `Gatherers` (plural, factory methods) and the interface is `Gatherer`; `gather` is the
>   `Stream` method. `Stream.gatherer(...)` / `Collectors.windowFixed` do not exist.
> - `scan` never includes the seed; `fold` emits exactly one element.
> - `windowSliding(1)` wraps every element: `[[1], [2], [3]]`.

## Practice

::exercise D6-EX-001
