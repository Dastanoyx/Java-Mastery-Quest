---
id: conc-collections-parallel
domain: D8
order: 4
title: Concurrent Collections & Parallel Streams
summary: Collections that many threads can share safely — ConcurrentHashMap, CopyOnWriteArrayList, synchronized wrappers, blocking and skip-list structures — and how to make parallel streams fast without making them wrong.
minutes: 50
objectives: [D8.3]
prerequisites: [conc-thread-safety]
contract:
  - Choose between ConcurrentHashMap, CopyOnWriteArrayList, Collections.synchronizedXxx, BlockingQueue, ConcurrentLinkedQueue and ConcurrentSkipListMap/Set for a given access pattern.
  - Predict iteration behaviour while modifying — fail-fast ArrayList vs weakly consistent ConcurrentHashMap vs snapshot CopyOnWriteArrayList.
  - Use ConcurrentHashMap's atomic merge/compute/putIfAbsent and know which nulls it rejects.
  - Use BlockingQueue's four method families (throw, special value, block, time out).
  - Predict which parallel-stream operations keep encounter order and why side effects into non-thread-safe collections and non-identity reduce seeds give wrong results.
keyRules:
  - "ConcurrentHashMap rejects null keys and null values (NullPointerException) — and get(null) throws too."
  - "merge, compute, computeIfAbsent, computeIfPresent and putIfAbsent on ConcurrentHashMap are atomic; get-then-put is not."
  - "A remapping function that returns null removes the entry."
  - "ConcurrentHashMap and ConcurrentSkipListMap iterators are weakly consistent: never throw ConcurrentModificationException and may or may not show later changes."
  - "CopyOnWriteArrayList iterators work on a snapshot: elements added during iteration are not seen by that iterator; iterator.remove() is unsupported."
  - "Collections.synchronizedList makes each call atomic, but you must still synchronize on the list while iterating."
  - "BlockingQueue: add/remove throw, offer/poll return false/null, put/take block, offer/poll with a time-out wait. No nulls."
  - "Parallel forEach has no ordering guarantee; forEachOrdered, collect, toList and findFirst respect encounter order."
  - "reduce(identity, op) on a parallel stream applies the identity once per chunk — it must be a true identity (0 for +, 1 for *, \"\" for concat)."
retrieval:
  - Name the four BlockingQueue method families with one method of each for inserting and removing.
  - Explain what happens when you add to a list while iterating it with a for-each loop, for ArrayList and for CopyOnWriteArrayList.
  - Why does `IntStream.rangeClosed(1, 4).parallel().reduce(10, Integer::sum)` not print 20?
  - Write a thread-safe word counter with ConcurrentHashMap in one line inside a loop.
checks: []
mastery: [D8-COL-002, D8-COL-004, D8-COL-006, D8-COL-007]
---

## Mental model: three ways to share a collection

1. **Lock the whole thing** — `Collections.synchronizedList(list)`, `Hashtable`, `Vector`. Every method
   locks one monitor. Correct but a bottleneck, and *compound* actions (check-then-act, iteration) still need
   external locking.
2. **Concurrent structures** — `ConcurrentHashMap`, `ConcurrentLinkedQueue`, `ConcurrentSkipListMap`.
   Fine-grained locking or lock-free CAS; many threads read and write at once; iterators never throw
   `ConcurrentModificationException`.
3. **Copy on write** — `CopyOnWriteArrayList`, `CopyOnWriteArraySet`. Every write copies the backing array;
   reads and iterations use an immutable snapshot. Ideal for read-mostly lists such as listener registries.

`java.util.concurrent` collections are thread-safe **per operation**. Thread safety of *your algorithm*
still depends on using their atomic compound operations instead of check-then-act sequences.

## ConcurrentHashMap

```java
ConcurrentMap<String, Integer> counts = new ConcurrentHashMap<>();
// WRONG under concurrency: two threads may both read 3 and both write 4
Integer old = counts.get(w); counts.put(w, old == null ? 1 : old + 1);
// RIGHT: one atomic operation
counts.merge(w, 1, Integer::sum);
```

| Operation | Atomic effect | Returns |
|---|---|---|
| `putIfAbsent(k, v)` | insert only if absent | previous value or `null` |
| `merge(k, v, f)` | absent ⇒ put v; present ⇒ put f(old, v); f returns null ⇒ remove | new value (or null) |
| `compute(k, (k, old) -> …)` | old may be null; result null ⇒ remove/no insert | new value |
| `computeIfAbsent(k, k -> …)` | only when absent; result null ⇒ nothing stored | current/new value |
| `computeIfPresent(k, (k, old) -> …)` | only when present | new value or null |

**No nulls.** Unlike `HashMap`, `put(null, v)`, `put(k, null)`, `get(null)`, `containsKey(null)` and
`remove(null)` all throw `NullPointerException` — because `get` returning `null` must unambiguously mean
"absent" when another thread might change the map between two calls.

```java predict
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        ConcurrentMap<String, Integer> m = new ConcurrentHashMap<>();
        for (String w : "to be or not to be".split(" ")) m.merge(w, 1, Integer::sum);
        System.out.println(new TreeMap<>(m));
        m.merge("to", 1, (old, one) -> null);          // null result removes "to"
        m.computeIfAbsent("be", k -> 100);             // present: unchanged
        m.computeIfPresent("or", (k, v) -> v + 10);
        System.out.println(new TreeMap<>(m));
        try {
            m.put("x", null);
        } catch (NullPointerException e) {
            System.out.println("no null values");
        }
    }
}
```
```output
{be=2, not=1, or=1, to=2}
{be=2, not=1, or=11}
no null values
```

(We copy into a `TreeMap` before printing only to get a deterministic order — `ConcurrentHashMap` iteration
order is unspecified.)

Iterators of `ConcurrentHashMap` are **weakly consistent**: they reflect the map at some point at or after
their creation, never throw `ConcurrentModificationException`, and may or may not show later changes. You can
even remove entries while iterating.

::check D8-COL-001

## Lists and iteration under modification

```java predict
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> cow = new CopyOnWriteArrayList<>(List.of(1, 2, 3));
        for (Integer i : cow) {
            if (i < 3) cow.add(i * 10);           // the loop's iterator still sees the old snapshot
            System.out.print(i + " ");
        }
        System.out.println(cow);

        List<Integer> plain = new ArrayList<>(List.of(1, 2, 3));
        for (Integer i : plain) {
            if (i < 3) plain.add(i * 10);
            System.out.print(i + " ");
        }
    }
}
```
```output
1 2 3 [1, 2, 3, 10, 20]
1
Exception in thread "main" java.util.ConcurrentModificationException
```

`ArrayList`'s iterator is **fail-fast**: it checks a modification counter on each `next()` and throws on
the first structural change it notices — even in a single thread. Across threads it is worse: an
unsynchronized `ArrayList` written by two threads can lose elements, hit
`ArrayIndexOutOfBoundsException`, or throw `ConcurrentModificationException`, unpredictably.
`CopyOnWriteArrayList`'s iterator works on a snapshot, so it never throws CME; its `iterator().remove()`
throws `UnsupportedOperationException`.

**Synchronized wrappers** make each method atomic, but iteration is many calls. The Javadoc of
`Collections.synchronizedList` requires you to lock the list yourself:

```java
List<String> names = Collections.synchronizedList(new ArrayList<>());
names.add("a");                                   // safe: one call
synchronized (names) {                            // REQUIRED for iteration
    for (String n : names) System.out.println(n);
}
```

## Queues and sorted concurrent structures

`BlockingQueue<E>` (`ArrayBlockingQueue` — bounded, `LinkedBlockingQueue` — optionally bounded,
`PriorityBlockingQueue`, `SynchronousQueue`, `DelayQueue`) is the backbone of producer–consumer designs:

| | Throws | Special value | Blocks | Times out |
|---|---|---|---|---|
| Insert | `add(e)` ⇒ `IllegalStateException` when full | `offer(e)` ⇒ `false` | `put(e)` | `offer(e, t, unit)` ⇒ `false` |
| Remove | `remove()` ⇒ `NoSuchElementException` when empty | `poll()` ⇒ `null` | `take()` | `poll(t, unit)` ⇒ `null` |
| Examine | `element()` | `peek()` | — | — |

`put`, `take` and the timed variants throw `InterruptedException`. No `BlockingQueue` accepts `null`
(`null` is the "empty" signal of `poll`).

```java predict
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        BlockingQueue<String> q = new ArrayBlockingQueue<>(2);
        System.out.println(q.offer("a") + " " + q.offer("b") + " " + q.offer("c"));
        try {
            q.add("d");
        } catch (IllegalStateException e) {
            System.out.println("add: " + e.getMessage());
        }
        System.out.println(q.take() + q.poll() + q.poll());
        System.out.println(q.poll(10, TimeUnit.MILLISECONDS));
    }
}
```
```output
true true false
add: Queue full
abnull
null
```

`ConcurrentLinkedQueue` / `ConcurrentLinkedDeque` are unbounded, lock-free, non-blocking queues: `offer`
always succeeds and `poll` returns `null` when empty. `ConcurrentSkipListMap` and `ConcurrentSkipListSet`
are the concurrent, **sorted** counterparts of `TreeMap`/`TreeSet` (`NavigableMap`/`NavigableSet`, natural
order or a `Comparator`, no nulls, weakly consistent iterators).

::check D8-COL-003

## Parallel streams

`collection.parallelStream()` or `stream.parallel()` splits the source into chunks processed by the
**common `ForkJoinPool`** (parallelism defaults to number of cores − 1; the calling thread helps too).
`isParallel()` reports the mode; the **last** `parallel()`/`sequential()` call before the terminal
operation wins for the whole pipeline.

**What stays deterministic:**

| Operation on an ordered source | Parallel result |
|---|---|
| `map`/`filter` + `toList()` / `collect(...)` | encounter order kept |
| `forEachOrdered(action)` | runs in encounter order |
| `findFirst()` | the first matching element in encounter order |
| `reduce` with an associative op and a true identity | same as sequential |
| `forEach(action)` | **any order**, on any thread |
| `findAny()` | **any** matching element |
| `unordered()` | drops the ordering constraint (may speed up `distinct`, `limit`, `findFirst`) |

```java predict
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        int seq = IntStream.rangeClosed(1, 4).reduce(10, Integer::sum);
        int par = IntStream.rangeClosed(1, 4).parallel().reduce(0, Integer::sum);
        System.out.println(seq + " " + par);
        List<Integer> nums = List.of(5, 8, 3, 12, 7, 20);
        System.out.println(nums.parallelStream().filter(n -> n > 6).findFirst().get());
        System.out.println(nums.parallelStream().map(n -> n % 5).toList());
        StringBuilder sb = new StringBuilder();
        Stream.of("a", "b", "c", "d").parallel().forEachOrdered(sb::append);
        System.out.println(sb);
        System.out.println(Stream.of(1, 2).parallel().sequential().isParallel());
    }
}
```
```output
20 10
8
[0, 3, 3, 2, 2, 0]
abcd
false
```

**What goes wrong:**

1. **Non-identity seed.** `reduce(10, Integer::sum)` adds 10 once **per chunk**. On a parallel stream the
   result depends on how many chunks were made — it is no longer the sequential answer. The identity must
   satisfy `op(identity, x) == x`.
2. **Side effects into a non-thread-safe collection.** `IntStream.range(0, 10_000).parallel().forEach(list::add)`
   with an `ArrayList` can silently lose elements or throw `ArrayIndexOutOfBoundsException`. Use
   `collect(Collectors.toList())` / `toList()` (each thread fills its own container and they are merged) or,
   if you truly need side effects, a concurrent collection.
3. **Non-associative or stateful lambdas** (e.g. subtraction in `reduce`, a lambda that reads a mutable
   field) give results that depend on the split.

`Collectors.groupingByConcurrent` and `toConcurrentMap` build one shared `ConcurrentMap` from all threads —
efficient for unordered parallel streams.

> [!NOTE]
> Parallel is not automatically faster: splitting, scheduling and merging cost time. It pays off for large,
> easily splittable sources (`ArrayList`, arrays, `IntStream.range`) and CPU-heavy, independent per-element
> work. Blocking I/O inside a parallel stream starves the shared common pool.

::check D8-COL-005

## What if…? One change at a time

| Change | Result |
|---|---|
| `new HashMap<>()` instead of `ConcurrentHashMap` + parallel `merge` from many threads | lost updates or corrupt map |
| `concurrentMap.put("k", null)` | `NullPointerException` |
| `computeIfAbsent(k, x -> null)` | nothing is stored, returns `null` |
| Remove keys from a `ConcurrentHashMap` inside `for (k : map.keySet())` | allowed, no CME |
| Same loop over a `HashMap` | `ConcurrentModificationException` |
| `ArrayBlockingQueue(2)`: third `put` from the only thread | blocks forever (no consumer) |
| `forEach` → `forEachOrdered` on a parallel ordered stream | output in encounter order |
| `findFirst` → `findAny` on a parallel stream | may return any matching element |
| Parallel `reduce(1, Integer::sum)` | result too large by (number of chunks − 1)… or more; unspecified |

## Exam traps checklist

> [!TRAP]
> - `ConcurrentHashMap`, `ConcurrentSkipListMap/Set` and every `BlockingQueue` reject `null`.
> - Concurrent collection iterators never throw `ConcurrentModificationException`; `ArrayList`'s does — even
>   in one thread.
> - `CopyOnWriteArrayList`: elements added during a for-each are **not** visited by that loop, but are in the
>   list afterwards.
> - `Collections.synchronizedList` still needs `synchronized (list)` around iteration.
> - `offer` returns `false`, `add` throws, `put` blocks.
> - Parallel `forEach` order is unspecified — any answer that claims an exact order is wrong.
> - `reduce` identity must be an identity; `collect`/`toList()` are safe with parallel streams; side effects
>   into an `ArrayList` are not.

## Practice

::check D8-COL-008
