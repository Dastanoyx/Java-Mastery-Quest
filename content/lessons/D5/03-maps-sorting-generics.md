---
id: coll-maps-sorting-generics
domain: D5
order: 3
title: Maps, Sorting, equals/hashCode & Generics
summary: Map operations and their return values (put, putIfAbsent, merge, compute*), TreeMap navigation and SequencedMap, Comparable vs Comparator chains, the equals/hashCode contract, and generics — wildcards, bounds, generic methods and type erasure.
minutes: 60
objectives: [D5.1]
prerequisites: [coll-lists-sets-deques]
contract:
  - Predict map contents and return values after put, getOrDefault, putIfAbsent, merge and compute/computeIfAbsent/computeIfPresent, including what happens when a function returns null.
  - Build Comparator chains with comparing/thenComparing/reversed/nullsFirst and predict the resulting order — in particular where reversed() is applied.
  - Explain why a class that overrides equals but not hashCode breaks HashMap/HashSet lookups.
  - Decide whether generic code compiles — wildcards (PECS), bounded type parameters, generic methods, raw types and erasure-related errors.
keyRules:
  - "`put` returns the previous value (or null); `putIfAbsent` only writes when the key is absent OR mapped to null."
  - "`merge(k, v, f)`: absent/null → put v; else put f(old, v); if f returns null the entry is REMOVED."
  - "compute*/merge: a remapping function returning null removes the mapping (or adds nothing)."
  - TreeMap sorts by key and rejects null keys; LinkedHashMap keeps insertion order (re-putting a key does not move it); HashMap order is unspecified.
  - "`comparing(a).thenComparing(b).reversed()` reverses the WHOLE chain; `comparing(a).reversed().thenComparing(b)` reverses only a."
  - If a.equals(b) then a.hashCode() == b.hashCode() must hold; violating it makes hash-based lookups miss.
  - "PECS: `? extends T` = producer (read as T, cannot add except null); `? super T` = consumer (can add T, reads as Object)."
  - "Erasure: no `new T()`, no `instanceof List<String>`, no generic array creation, and two overloads that erase to the same signature do not compile."
retrieval:
  - Write the result of `map.merge("k", 1, Integer::sum)` when k is absent, present with 3, and when the function returns null.
  - Explain PECS with `Collections.copy(List<? super T> dest, List<? extends T> src)`.
  - List four things you cannot do with a type parameter T because of erasure.
checks: [D5-MAP-001, D5-SRT-001, D5-GEN-001]
mastery: [D5-MAP-002, D5-MAP-003, D5-SRT-002, D5-SRT-003, D5-GEN-002, D5-GEN-003, D5-GEN-004]
---

## Mental model: a map is a set of keys, each pointing to one value

A `Map<K, V>` is **not** a `Collection`. It stores unique keys (uniqueness decided exactly as in the
matching set: `equals`/`hashCode` for `HashMap`, `compareTo`/`compare` for `TreeMap`), each mapped to one
value. Three views connect it to the collection world: `keySet()`, `values()` and `entrySet()`. They are live —
removing a key from `keySet()` removes the entry from the map.

| Implementation | Order | null key | null values |
|---|---|---|---|
| `HashMap` | unspecified | one allowed | allowed |
| `LinkedHashMap` | insertion order (re-putting a key does not move it) | allowed | allowed |
| `TreeMap` | sorted by key | **NPE** (natural order) | allowed |
| `Map.of(...)`, `Map.ofEntries`, `Map.copyOf` | unspecified | **NPE** | **NPE**; duplicate keys → `IllegalArgumentException` |

## Map operations and their return values

| Call | Effect | Returns |
|---|---|---|
| `put(k, v)` | always writes | previous value or `null` |
| `get(k)` | — | value, or `null` (absent **or** mapped to null) |
| `getOrDefault(k, d)` | — | `d` only if the key is **absent** (a key mapped to null returns `null`) |
| `putIfAbsent(k, v)` | writes if absent **or mapped to null** | previous value (or `null`) |
| `remove(k)` | deletes | removed value or `null` |
| `merge(k, v, f)` | absent/null → `v`; else `f(old, v)`; result null → **remove** | new value |
| `compute(k, f)` | `f(k, oldOrNull)`; null result → remove | new value |
| `computeIfAbsent(k, f)` | only if absent/null; null result → nothing added | current value |
| `computeIfPresent(k, f)` | only if present and non-null; null result → remove | new value or `null` |

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        Map<String, Integer> m = new HashMap<>();
        System.out.println(m.put("a", 1) + " " + m.put("a", 2) + " " + m.get("a"));
        System.out.println(m.getOrDefault("z", 0) + " " + m.putIfAbsent("a", 9) + " " + m.putIfAbsent("b", 3));
        Map<String, Integer> counts = new TreeMap<>();
        for (String w : "b a b c b a".split(" "))
            counts.merge(w, 1, Integer::sum);
        System.out.println(counts);
        counts.merge("c", 5, (oldV, newV) -> null);        // null ⇒ remove
        counts.compute("a", (k, v) -> v == null ? 1 : v * 10);
        counts.computeIfAbsent("d", k -> 4);
        counts.computeIfPresent("b", (k, v) -> null);       // null ⇒ remove
        System.out.println(counts);
    }
}
```
```output
null 1 2
0 2 null
{a=2, b=3, c=1}
{a=20, d=4}
```

`computeIfAbsent` is the idiom for a multimap: `groups.computeIfAbsent(key, k -> new ArrayList<>()).add(x)`.

Iterate a map with `entrySet()` — it gives you key and value together, and `Map.Entry.setValue` writes through.
Adding a **new key** while iterating over a `HashMap` view is a structural modification and makes the iterator
throw `ConcurrentModificationException` on its next step.

::check D5-MAP-001

### TreeMap navigation and SequencedMap (Java 21)

`TreeMap` implements `NavigableMap`, mirroring `TreeSet`: `firstKey()`, `ceilingKey(k)`, `floorEntry(k)`,
`higherKey(k)`, `headMap(k)` (exclusive), `tailMap(k)` (inclusive), `descendingMap()`.

Java 21 (JEP 431) added **`SequencedMap`**, implemented by `LinkedHashMap` and by `SortedMap`/`TreeMap`:
`firstEntry()`, `lastEntry()`, `pollFirstEntry()`, `pollLastEntry()`, `putFirst(k, v)`, `putLast(k, v)`,
`reversed()`, `sequencedKeySet()`, `sequencedValues()`, `sequencedEntrySet()`.

- `HashMap` is **not** sequenced — `new HashMap<>().firstEntry()` does not compile; neither does
  `Map<…> m = …; m.firstEntry()` (the declared type `Map` has no such method).
- On a `LinkedHashMap`, `putFirst`/`putLast` insert the key at that end, or **move** an existing key there.
- On a `TreeMap`, `putFirst`/`putLast` throw `UnsupportedOperationException` — the comparator decides position.

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        LinkedHashMap<String, Integer> lm = new LinkedHashMap<>();
        lm.put("x", 1);
        lm.put("y", 2);
        lm.put("x", 3);                 // re-put: x keeps its position
        lm.putFirst("w", 0);            // w, x, y
        lm.putLast("x", 5);             // moves x to the end: w, y, x
        System.out.println(lm + " " + lm.firstEntry() + " " + lm.reversed());
        System.out.println(lm.pollFirstEntry() + " " + lm);
        TreeMap<Integer, String> tm = new TreeMap<>(Map.of(10, "ten", 20, "twenty", 30, "thirty"));
        System.out.println(tm.ceilingKey(15) + " " + tm.floorEntry(25) + " " + tm.headMap(20) + " " + tm.lastEntry());
    }
}
```
```output
{w=0, y=2, x=5} w=0 {x=5, y=2, w=0}
w=0 {y=2, x=5}
20 20=twenty {10=ten} 30=thirty
```

## Sorting: Comparable vs Comparator

| | `Comparable<T>` | `Comparator<T>` |
|---|---|---|
| Package | `java.lang` | `java.util` |
| Method | `int compareTo(T o)` | `int compare(T a, T b)` |
| Where | implemented **by the class itself** — its "natural order" | a separate object, any number of orders |
| Used by | `Collections.sort(list)`, `TreeSet`/`TreeMap` without comparator, `Arrays.sort(Object[])` | `list.sort(cmp)`, `new TreeSet<>(cmp)`, `Arrays.sort(arr, cmp)` |

Results: negative ⇒ first is smaller, 0 ⇒ equal (for sorted collections: a duplicate!), positive ⇒ greater.
`Collections.sort(list)` only compiles when the element type is `Comparable` (`<T extends Comparable<? super T>>`);
a `TreeSet` of non-`Comparable` objects compiles but throws `ClassCastException` on the first `add`.
`list.sort(null)` sorts by natural order.

**Building comparators** — the static and default methods on `Comparator`:

- `Comparator.comparing(keyExtractor)` / `comparingInt` / `comparing(keyExtractor, keyComparator)`
- `thenComparing(...)` — tie-breaker used only when the previous comparison returned 0
- `reversed()` — reverses **everything built so far**
- `Comparator.naturalOrder()`, `Comparator.reverseOrder()`, `Comparator.nullsFirst(c)`, `nullsLast(c)`

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        List<String> w = new ArrayList<>(List.of("kiwi", "fig", "apple", "date"));
        w.sort(Comparator.comparing(String::length).reversed().thenComparing(Comparator.naturalOrder()));
        System.out.println(w);
        w.sort(Comparator.comparing(String::length).thenComparing(Comparator.naturalOrder()).reversed());
        System.out.println(w);
        List<String> names = new ArrayList<>(Arrays.asList("bo", null, "Al", "cy"));
        names.sort(Comparator.nullsFirst(Comparator.naturalOrder()));
        System.out.println(names);
    }
}
```
```output
[apple, date, kiwi, fig]
[apple, kiwi, date, fig]
[null, Al, bo, cy]
```

In the first sort only the length is reversed, so equal-length words stay alphabetical (`date, kiwi`). In the
second, `reversed()` applies to the whole chain, so ties are reverse-alphabetical (`kiwi, date`).

> [!TRAP]
> `Comparator.comparing(s -> s.length()).reversed()` does **not** compile in a `List<String>.sort(...)` call:
> the call to `reversed()` stops target typing, so `s` is inferred as `Object` (*cannot find symbol: method
> length()*). Fix it with a method reference `String::length` or an explicit `(String s) -> s.length()`.

`Collections.reverse(list)` reverses the current order (it does not sort), and `Collections.sort` on a list
containing `null` throws `NullPointerException`.

::check D5-SRT-001

## equals and hashCode — the contract hash collections depend on

`HashMap`/`HashSet` first use `hashCode()` to pick a bucket, then `equals()` inside it. The contract:

1. `equals` is reflexive, symmetric, transitive, consistent, and `x.equals(null)` is `false`.
2. **If `a.equals(b)` then `a.hashCode() == b.hashCode()`.** (The converse is not required — collisions are fine.)
3. `hashCode` must stay the same while the fields used by `equals` do not change.

Override `equals` but not `hashCode`, and two "equal" objects usually land in different buckets:

```java predict
import java.util.*;
class Key {
    final String id;
    Key(String id) { this.id = id; }
    @Override public boolean equals(Object o) { return o instanceof Key k && k.id.equals(id); }
    // hashCode NOT overridden → identity-based
}
public class Main {
    public static void main(String[] args) {
        Map<Key, Integer> m = new HashMap<>();
        m.put(new Key("a"), 1);
        System.out.println(m.get(new Key("a")) + " " + new Key("a").equals(new Key("a")));
        List<Key> list = new ArrayList<>(List.of(new Key("a")));
        System.out.println(list.contains(new Key("a")));
    }
}
```
```output
null true
true
```

`List.contains` only uses `equals`, so it works; the `HashMap` lookup misses. Two more classic bugs:
**mutating** a key after insertion (its hash changes, so the entry becomes unreachable), and writing
`public boolean equals(Key k)` — an *overload*, not an override — so collections still use `Object.equals`.
Records generate a correct `equals`/`hashCode` from all components automatically.

## Generics: type safety at compile time

**Basics.** `List<String> names = new ArrayList<>();` — the diamond infers the type arguments from the target.
A **raw type** (`List list = new ArrayList();`) switches off generic checking; it compiles with an
*unchecked* warning, and errors appear later as `ClassCastException`s far from their cause.

**Invariance.** `List<Integer>` is **not** a `List<Number>` (unlike arrays). `List<Number> n = new ArrayList<Integer>();`
does not compile — otherwise you could add a `Double` to a list of integers.

**Wildcards** restore flexibility for *parameters*:

| Declaration | Can read as | Can add | Accepts |
|---|---|---|---|
| `List<?>` | `Object` | only `null` | any list |
| `List<? extends Number>` | `Number` | only `null` | `List<Integer>`, `List<Double>`, `List<Number>` |
| `List<? super Integer>` | `Object` | `Integer` (and subtypes) | `List<Integer>`, `List<Number>`, `List<Object>` |

**PECS — Producer `extends`, Consumer `super`**: if a parameter *produces* values you read, use `extends`; if it
*consumes* values you write, use `super`. That is exactly `Collections.copy(List<? super T> dest, List<? extends T> src)`.

**Bounded type parameters and generic methods:**

```java predict
import java.util.*;
public class Main {
    static <T extends Comparable<T>> T max(List<T> list) {        // bounded type parameter
        T best = list.get(0);
        for (T t : list) if (t.compareTo(best) > 0) best = t;
        return best;
    }
    static double sum(Collection<? extends Number> c) {            // producer
        double s = 0;
        for (Number n : c) s += n.doubleValue();
        return s;
    }
    static void fill(List<? super Integer> target) {              // consumer
        for (int i = 1; i <= 3; i++) target.add(i);
    }
    public static void main(String[] args) {
        System.out.println(max(List.of("pear", "apple", "zoo")));
        List<Number> nums = new ArrayList<>();
        fill(nums);
        nums.add(2.5);
        System.out.println(nums + " " + sum(nums));
        System.out.println(Main.<Integer>max(List.of(3, 9, 4)));   // explicit type witness
    }
}
```
```output
zoo
[1, 2, 3, 2.5] 8.5
9
```

The type parameter of a generic method is declared **before the return type** (`static <T> T pick(...)`).
Bounds use `extends` for both classes and interfaces: `<T extends Number & Comparable<T>>` (class first).

::check D5-GEN-001

## Type erasure and its consequences

The compiler checks generic types, then **erases** them: `List<String>` and `List<Integer>` become the same
runtime class `ArrayList`, and `T` becomes its bound (or `Object`). Therefore:

| Code | Result | Why |
|---|---|---|
| `T t = new T();` | compile error: *unexpected type* | `T` is unknown at runtime |
| `obj instanceof List<String>` | compile error (from `Object`) | the type argument is not available at runtime; `instanceof List<?>` is fine |
| `new List<String>[3]` | compile error: *generic array creation* | arrays need a reifiable component type |
| `void m(List<String> l)` + `void m(List<Integer> l)` | compile error: *name clash … have the same erasure* | both erase to `m(List)` |
| `static T value;` in `class Box<T>` | compile error | type parameters belong to instances |
| `new ArrayList<String>().getClass() == new ArrayList<Integer>().getClass()` | `true` | same runtime class |
| primitives as type arguments (`List<int>`) | compile error | type arguments must be reference types |

```java predict
import java.util.*;
public class Main {
    void m(List<String> l) { }
    void m(List<Integer> l) { }
    public static void main(String[] args) { }
}
```
```output
Compilation fails: name clash: m(java.util.List<java.lang.Integer>) and m(java.util.List<java.lang.String>) have the same erasure
```

> [!TRAP]
> With raw types, the error appears at the *read*, not the write:
> `List raw = new ArrayList(); raw.add(1); List<String> s = raw; String x = s.get(0);` compiles (with
> warnings) and throws `ClassCastException` on the last statement.

## What if…? One change at a time

| Change | Result |
|---|---|
| `getOrDefault("k", 7)` where `k` maps to `null` | `null` — the key is present |
| `merge` function returns `null` | the entry is removed |
| `HashMap` → `TreeMap` and `put(null, 1)` | `NullPointerException` |
| `.reversed()` moved from after `comparing(a)` to the end of the chain | the tie-breaker is reversed too |
| Remove `hashCode()` from a key class that overrides `equals` | `HashMap.get` with an equal key returns `null` |
| `List<? extends Number> l` then `l.add(1)` | compile error |
| `List<? super Integer> l` then `Integer i = l.get(0)` | compile error (reads as `Object`) |
| Pass `List<Double>` to `fill(List<? super Integer>)` | compile error |

## Exam traps checklist

> [!TRAP]
> - `put` returns the **old** value; `merge`/`compute` return the **new** value.
> - `TreeMap`/`TreeSet` use the comparator for equality: two keys that compare as 0 are the same key.
> - `Map` is not a `Collection` and is not `Iterable` — `for (var e : map)` does not compile.
> - `List<Object>` is not a supertype of `List<String>`; `List<?>` is.
> - `Comparator.reverseOrder()` and `Collections.reverseOrder()` both give the reverse of natural order;
>   `Collections.reverse(list)` is not a comparator — it reverses a list in place.

## Practice

::exercise D5-EX-001
