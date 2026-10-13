---
id: coll-lists-sets-deques
domain: D5
order: 2
title: Lists, Sets, Deques & Sequenced Collections
summary: The List, Set and Deque families, which operations succeed, return special values or throw, immutable factories vs views, iteration-time modification, TreeSet navigation and Java 21 sequenced collections.
minutes: 55
objectives: [D5.1]
prerequisites: [coll-arrays]
contract:
  - Predict the contents of a List after add/set/remove calls, including the remove(int) vs remove(Object) overloads with Integer elements and subList views.
  - Predict iteration order for HashSet, LinkedHashSet and TreeSet (natural order or a Comparator) and the effect of "equal by comparator" on duplicates.
  - Use a Deque as a stack and as a queue, and say which methods throw and which return null/false when empty or full.
  - Decide which types are sequenced collections, and which SequencedCollection operations throw UnsupportedOperationException or NoSuchElementException.
  - Distinguish unmodifiable copies (List.of, List.copyOf) from unmodifiable views (Collections.unmodifiableList) and fixed-size lists (Arrays.asList).
keyRules:
  - "`list.remove(1)` on a List<Integer> removes the element at INDEX 1; `list.remove(Integer.valueOf(1))` removes the VALUE 1."
  - List.of / Set.of / List.copyOf create unmodifiable collections that reject null (NullPointerException); Set.of rejects duplicates (IllegalArgumentException).
  - Collections.unmodifiableList is a read-only VIEW — changes to the backing list show through it; List.copyOf is an independent snapshot.
  - Structurally modifying a list (other than through its iterator) during a for-each loop usually throws ConcurrentModificationException.
  - HashSet has no defined order, LinkedHashSet keeps insertion order, TreeSet keeps sorted order and treats elements as duplicates when compareTo/compare returns 0.
  - ArrayDeque does not allow null elements; push/pop/peek work at the head (stack), offer/poll/peek implement a FIFO queue.
  - "Sequenced (Java 21): List, Deque, LinkedHashSet, SortedSet/TreeSet are SequencedCollections; HashSet is not. TreeSet.addFirst/addLast throw UnsupportedOperationException."
  - reversed() returns a VIEW, not a copy; writes through it affect the original.
retrieval:
  - Write the result of `List<Integer> l = new ArrayList<>(List.of(10, 20, 30)); l.remove(1); l.remove(Integer.valueOf(10));`.
  - For a Deque, list which methods throw on an empty deque and which return null.
  - Name four types that implement SequencedCollection and two common ones that do not.
checks: [D5-LST-001, D5-LST-002, D5-SET-001, D5-SEQ-001]
mastery: [D5-LST-003, D5-LST-004, D5-SET-002, D5-SET-003, D5-DEQ-001, D5-SEQ-002, D5-SEQ-003]
---

## Mental model: interfaces describe behaviour, classes choose the trade-offs

```
                      Collection<E>
                           │
                  SequencedCollection<E>   (Java 21, ordered: first/last, reversed())
          ┌────────────────┼──────────────────────┐
       List<E>          Deque<E>          SequencedSet<E>        Set<E>  (unordered sets, e.g. HashSet)
   ArrayList            ArrayDeque        LinkedHashSet           │
   LinkedList ─────────►LinkedList        SortedSet → NavigableSet → TreeSet
```

- A **List** is an ordered, index-based sequence that allows duplicates and (for ArrayList/LinkedList) nulls.
- A **Set** has no duplicates — "duplicate" meaning `equals` for hash sets, and `compareTo`/`compare` returning
  0 for `TreeSet`.
- A **Deque** ("deck") allows insertion/removal at both ends: it is the recommended stack *and* queue.
- A **sequenced** collection has a well-defined encounter order with a first and last element.

`ArrayList` is backed by an array (fast random access); `LinkedList` is a doubly-linked list that implements
both `List` and `Deque`. Behavioural results on the exam are the same — only performance differs.

## List operations and the remove overload trap

| Call | Returns | Notes |
|---|---|---|
| `add(e)` / `add(i, e)` | `true` / `void` | `add(i, e)` shifts right; `i == size()` is allowed, `i > size()` throws `IndexOutOfBoundsException` |
| `set(i, e)` | the **old** element | does not change the size |
| `get(i)` | element | `IndexOutOfBoundsException` if out of range |
| `remove(int index)` | removed element | shifts left |
| `remove(Object o)` | `boolean` | removes the first equal element |
| `indexOf(o)` / `contains(o)` | `int` / `boolean` | use `equals`; `-1` if absent |
| `replaceAll(UnaryOperator)` | `void` | replaces each element in place |
| `removeIf(Predicate)` | `boolean` | safe removal while "iterating" |

With a `List<Integer>`, `remove(1)` picks `remove(int)` because an exact `int` match beats boxing in overload
resolution:

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        List<Integer> nums = new ArrayList<>(List.of(10, 20, 30, 1));
        nums.remove(1);                        // index 1 → removes 20
        System.out.println(nums);
        nums.remove(Integer.valueOf(1));       // value 1
        System.out.println(nums);
        System.out.println(nums.set(0, 99) + " " + nums);
        List<String> names = new ArrayList<>(List.of("ann", "bob", "cy"));
        names.replaceAll(String::toUpperCase);
        names.removeIf(s -> s.length() < 3);
        System.out.println(names);
    }
}
```
```output
[10, 30, 1]
[10, 30]
10 [99, 30]
[ANN, BOB]
```

**subList(from, to)** returns a *view* of the half-open range `[from, to)`. Changes through the view hit the
backing list and vice versa — but a **structural** change made directly to the backing list invalidates the
view (later use throws `ConcurrentModificationException`).

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        List<Integer> list = new ArrayList<>(List.of(4, 8, 15, 16, 23));
        List<Integer> mid = list.subList(1, 4);       // [8, 15, 16]
        mid.replaceAll(n -> n * 10);
        mid.remove(Integer.valueOf(150));
        System.out.println(list + " " + mid);
        mid.clear();                                  // a classic "remove a range" idiom
        System.out.println(list);
    }
}
```
```output
[4, 80, 160, 23] [80, 160]
[4, 23]
```

::check D5-LST-001

### Modifying while iterating

A for-each loop uses an `Iterator`. `ArrayList`'s iterator is **fail-fast**: if the list is structurally
modified other than through the iterator, the next call to `next()` throws `ConcurrentModificationException`.

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        List<String> letters = new ArrayList<>(List.of("a", "b", "c"));
        try {
            for (String s : letters)
                if (s.equals("a")) letters.remove(s);
        } catch (ConcurrentModificationException e) {
            System.out.println("CME, list is now " + letters);
        }
        List<String> safe = new ArrayList<>(List.of("a", "b", "c"));
        Iterator<String> it = safe.iterator();
        while (it.hasNext())
            if (it.next().equals("a")) it.remove();
        System.out.println(safe);
    }
}
```
```output
CME, list is now [b, c]
[b, c]
```

> [!TRAP]
> Removing the **second-to-last** element in a for-each loop does *not* throw: after the removal `hasNext()`
> compares the cursor with the new size and returns `false`, so the loop just ends (and the last element is
> never visited). The exam answer for "remove inside for-each" is therefore usually "CME", but check the
> position. Prefer `removeIf` or an explicit `Iterator.remove()`.

::check D5-LST-002

## Unmodifiable, fixed-size and views — four different things

| Created by | add/remove | set | null elements | Reflects later changes to source? |
|---|---|---|---|---|
| `new ArrayList<>(src)` | yes | yes | yes | no (copy) |
| `Arrays.asList(arr)` | `UnsupportedOperationException` | yes (writes through) | yes | **yes** (array-backed) |
| `List.of(...)`, `List.copyOf(src)` | UOE | UOE | **NPE** at creation | no (immutable snapshot) |
| `Collections.unmodifiableList(src)` | UOE | UOE | as source | **yes** (read-only view) |

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        List<String> src = new ArrayList<>(List.of("b", "a"));
        List<String> view = Collections.unmodifiableList(src);
        List<String> copy = List.copyOf(src);
        src.add("c");
        Collections.sort(src);
        System.out.println(view + " " + copy);
        try { view.add("d"); } catch (UnsupportedOperationException e) { System.out.println("view is read-only"); }
        try { List.of("x", null); } catch (NullPointerException e) { System.out.println("List.of rejects null"); }
        try { Set.of(1, 1); } catch (IllegalArgumentException e) { System.out.println(e.getMessage()); }
    }
}
```
```output
[a, b, c] [b, a]
view is read-only
List.of rejects null
duplicate element: 1
```

> [!TRAP]
> Even *queries* with `null` throw on these immutable collections: `List.of(1).contains(null)` ⇒
> `NullPointerException`. And `Collections.sort(list)` on a list containing `null` throws NPE as well.

## Sets: HashSet, LinkedHashSet, TreeSet

- `HashSet` — uses `hashCode`/`equals`; iteration order is unspecified (never rely on it); allows one `null`.
- `LinkedHashSet` — `HashSet` + insertion order; re-adding an existing element does not move it.
- `TreeSet` — sorted by natural order (`Comparable`) or a supplied `Comparator`; rejects `null` (NPE); an
  element whose class is not `Comparable` (and no comparator) causes `ClassCastException` at the **first add**.

`add` returns `false` for a duplicate; `remove` returns `false` if absent. For `TreeSet`, "duplicate" means the
comparator returns 0 — even if `equals` would say the objects differ:

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        Set<String> natural = new TreeSet<>(List.of("pear", "Apple", "fig", "apple"));
        System.out.println(natural);
        Set<String> ci = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        ci.addAll(List.of("pear", "Apple", "fig", "apple"));
        System.out.println(ci);
        TreeSet<String> byLength = new TreeSet<>(Comparator.comparing(String::length));
        System.out.println(byLength.add("aa") + " " + byLength.add("bb") + " " + byLength.add("c") + " " + byLength);
    }
}
```
```output
[Apple, apple, fig, pear]
[Apple, fig, pear]
true false true [c, aa]
```

### TreeSet navigation (NavigableSet)

| Method | Returns |
|---|---|
| `ceiling(e)` / `floor(e)` | smallest element `>= e` / largest `<= e` (or `null`) |
| `higher(e)` / `lower(e)` | smallest element `> e` / largest `< e` (or `null`) |
| `first()` / `last()` | `NoSuchElementException` if empty |
| `pollFirst()` / `pollLast()` | removes and returns, `null` if empty |
| `headSet(e)` / `tailSet(e)` | `< e` (exclusive) / `>= e` (**inclusive**) — live views |
| `headSet(e, true)`, `tailSet(e, false)`, `subSet(a, b)` | explicit inclusiveness; `subSet(a, b)` is `[a, b)` |
| `descendingSet()` | reverse-order view |

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        TreeSet<Integer> t = new TreeSet<>(List.of(10, 20, 30, 40));
        System.out.println(t.ceiling(25) + " " + t.floor(25) + " " + t.higher(20) + " " + t.lower(20)
                + " " + t.ceiling(20) + " " + t.higher(40));
        System.out.println(t.headSet(30) + " " + t.tailSet(30) + " " + t.subSet(10, 30));
        SortedSet<Integer> head = t.headSet(30);
        t.add(15);                       // the view sees it
        System.out.println(head);
        try { head.add(35); } catch (IllegalArgumentException e) { System.out.println(e.getMessage()); }
    }
}
```
```output
30 20 30 10 20 null
[10, 20] [30, 40] [10, 20]
[10, 15, 20]
key out of range
```

::check D5-SET-001

## Deque: one class, two disciplines

`ArrayDeque` is the go-to implementation for both stacks and queues. Each operation exists in a **throwing**
form and a **special-value** form:

| | Throws on failure | Returns special value |
|---|---|---|
| insert at head | `addFirst(e)`, `push(e)` | `offerFirst(e)` → `false` |
| insert at tail | `addLast(e)`, `add(e)` | `offerLast(e)`, `offer(e)` → `false` |
| remove head | `removeFirst()`, `remove()`, `pop()` → `NoSuchElementException` | `pollFirst()`, `poll()` → `null` |
| examine head | `getFirst()`, `element()` → `NoSuchElementException` | `peekFirst()`, `peek()` → `null` |

- **Stack (LIFO)**: `push`, `pop`, `peek` — all at the head.
- **Queue (FIFO)**: `offer`/`add` at the tail, `poll`/`remove`/`peek` at the head.
- `peek()` is the head in both disciplines, so mixing `push` and `offer` on one deque is legal but confusing.
- `ArrayDeque` throws `NullPointerException` for `null` elements (null is the "empty" signal of `poll`/`peek`).
  `LinkedList` allows null.

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(1); stack.push(2); stack.push(3);
        System.out.println(stack + " peek=" + stack.peek() + " pop=" + stack.pop() + " " + stack);
        Deque<Integer> queue = new ArrayDeque<>();
        queue.offer(1); queue.offer(2); queue.add(3);
        System.out.println(queue + " peek=" + queue.peek() + " poll=" + queue.poll() + " " + queue);
        Deque<Integer> empty = new ArrayDeque<>();
        System.out.println(empty.peek() + " " + empty.poll());
        try { empty.pop(); } catch (NoSuchElementException e) { System.out.println("pop on empty"); }
        try { queue.offer(null); } catch (NullPointerException e) { System.out.println("no nulls"); }
    }
}
```
```output
[3, 2, 1] peek=3 pop=3 [2, 1]
[1, 2, 3] peek=1 poll=1 [2, 3]
null null
pop on empty
no nulls
```

## Sequenced collections (Java 21)

Java 21 (JEP 431) added three interfaces that give every *ordered* collection the same API:

```java
interface SequencedCollection<E> extends Collection<E> {
    SequencedCollection<E> reversed();          // a VIEW in reverse order
    void addFirst(E e);  void addLast(E e);     // default: throw UnsupportedOperationException
    E getFirst();        E getLast();           // NoSuchElementException if empty
    E removeFirst();     E removeLast();        // NoSuchElementException if empty
}
interface SequencedSet<E> extends SequencedCollection<E>, Set<E> { SequencedSet<E> reversed(); }
interface SequencedMap<K, V> extends Map<K, V> { ... }   // covered in the next lesson
```

| Type | Sequenced? | Notes |
|---|---|---|
| `List` (all), `Deque` (all) | `SequencedCollection` | `List.getFirst()` replaces `list.get(0)` |
| `LinkedHashSet` | `SequencedSet` | `addFirst(e)` **moves** an existing element to the front |
| `SortedSet` / `NavigableSet` / `TreeSet` | `SequencedSet` | `addFirst`/`addLast` → `UnsupportedOperationException` (order is decided by the comparator) |
| `HashSet`, `Set.of(...)` | **no** | `hashSet.getFirst()` does not compile |

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        List<Integer> list = new ArrayList<>(List.of(1, 2, 3));
        list.addFirst(0);
        list.addLast(4);
        List<Integer> rev = list.reversed();
        System.out.println(list.getFirst() + " " + list.getLast() + " " + rev);
        rev.removeFirst();                    // removes 4 from list too
        System.out.println(list);
        LinkedHashSet<String> s = new LinkedHashSet<>(List.of("b", "c"));
        s.addFirst("a");
        s.addFirst("c");                      // moves c to the front
        System.out.println(s + " " + s.reversed());
        TreeSet<Integer> ts = new TreeSet<>(List.of(3, 1, 2));
        System.out.println(ts.getFirst() + " " + ts.removeLast() + " " + ts);
        try { ts.addFirst(0); } catch (UnsupportedOperationException e) { System.out.println("TreeSet.addFirst: UOE"); }
    }
}
```
```output
0 4 [4, 3, 2, 1, 0]
[0, 1, 2, 3]
[c, a, b] [b, a, c]
1 3 [1, 2]
TreeSet.addFirst: UOE
```

> [!TRAP]
> `List.of(1, 2, 3).reversed()` works (it is a read-only view) — but `List.of(1, 2, 3).reversed().removeFirst()`
> throws `UnsupportedOperationException`. A reversed view supports exactly what the original supports.

::check D5-SEQ-001

## What if…? One change at a time

| Change | Result |
|---|---|
| `remove(1)` → `remove(Integer.valueOf(1))` on a `List<Integer>` | removes by value instead of by index |
| `new ArrayList<>(List.of(...))` → `List.of(...)` | every mutator throws `UnsupportedOperationException` |
| `new TreeSet<>()` → `new TreeSet<>(Comparator.comparing(String::length))` | equal-length strings become "duplicates" |
| `HashSet` → `LinkedHashSet` | iteration order becomes insertion order |
| `Deque.pop()` → `poll()` on an empty deque | `null` instead of `NoSuchElementException` |
| `new LinkedList<>()` → `new ArrayDeque<>()` and `offer(null)` | NPE instead of a stored null |
| `tailSet(30)` → `tailSet(30, false)` | 30 is excluded |
| `TreeSet.addLast(x)` | `UnsupportedOperationException` |

## Exam traps checklist

> [!TRAP]
> - `list.add(list.size(), x)` is legal (append); `list.add(list.size() + 1, x)` throws `IndexOutOfBoundsException`.
> - `set` returns the *old* element, `put` (maps) returns the *old* value, `add` on a set returns a boolean.
> - `Arrays.asList` supports `set` but not `add`/`remove`; `List.of` supports none of them.
> - `headSet(x)` excludes `x`; `tailSet(x)` includes it.
> - `HashSet` is **not** a `SequencedCollection` — `getFirst()` on it is a compile error, not a runtime one.
