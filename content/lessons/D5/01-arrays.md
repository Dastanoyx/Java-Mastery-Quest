---
id: coll-arrays
domain: D5
order: 1
title: Arrays — Declaration, Initialization, Multidimensional Arrays & java.util.Arrays
summary: Every legal way to declare and create an array, default values, ragged arrays, covariance and ArrayStoreException, and the java.util.Arrays toolbox — toString, equals, compare, mismatch, sort, binarySearch and asList.
minutes: 45
objectives: [D5.1]
prerequisites: []
contract:
  - Decide whether an array declaration or creation expression compiles, and determine the exact type of each variable in a mixed declaration such as `int a[], b;`.
  - Predict default values, lengths and contents of single, multidimensional and ragged arrays.
  - Explain array covariance and predict when ArrayStoreException is thrown.
  - Predict the results of Arrays.equals/compare/mismatch/binarySearch (including the negative insertion point) and the behaviour of the fixed-size Arrays.asList view.
keyRules:
  - "`int[] a, b;` declares two arrays; `int a[], b;` declares one array and one int."
  - An array creation needs either a dimension (`new int[3]`) or an initializer (`new int[]{1,2}`), never both and never neither.
  - The `{...}` shorthand without `new` is only allowed in a declaration.
  - Array elements always get default values (0, 0.0, false, '\u0000', null), even for local arrays.
  - In `new int[3][]` only the first dimension is required; the rows are null until assigned.
  - Arrays are covariant (`Object[] o = new String[2]` compiles), so storing the wrong type fails at runtime with ArrayStoreException.
  - "Arrays.binarySearch on a sorted array returns the index if found, otherwise -(insertionPoint) - 1; on an unsorted array the result is undefined."
  - Arrays.asList returns a fixed-size list backed by the array — set works and writes through, add/remove throw UnsupportedOperationException.
retrieval:
  - Write four legal and four illegal array declarations/creations from memory.
  - Compute Arrays.binarySearch(new int[]{10, 20, 30}, 15) and explain the formula.
  - Explain why `Object[] o = new String[1]; o[0] = 1;` compiles but fails at runtime.
checks: [D5-ARR-001, D5-ARR-002, D5-ARR-003]
mastery: [D5-ARR-004, D5-ARR-005, D5-ARR-006, D5-ARR-007, D5-ARR-008]
---

## Mental model: an array is an object with a fixed number of typed slots

An array is a **heap object** that holds `length` slots of one element type. The variable you declare is a
*reference* to that object. Three consequences drive almost every exam question:

1. **The size is fixed** at creation and is part of the object, not of the type: `int[]` can refer to arrays of
   any length. `length` is a final **field** (`a.length`), not a method — `a.length()` does not compile.
2. **Slots are always initialized** with the element type's default value (`0`, `0.0`, `false`, `'\u0000'`,
   `null`), even when the array is a local variable.
3. **Arrays do not override `equals`, `hashCode` or `toString`**. `a.equals(b)` is identity, and printing an
   array gives something like `[I@1b6d3586`. Use `java.util.Arrays` helpers instead.

A multidimensional array is simply an **array of arrays**: `int[][]` is an array whose elements are `int[]`
references. Rows can have different lengths ("ragged" or "jagged" arrays), and a row can even be `null`.

## Declaration and creation rules

The brackets can go after the type or after the variable name — and that makes a difference in a
multi-variable declaration:

```java
int[] a, b;         // a and b are both int[]
int c[], d;         // c is int[], d is int
int[] e, f[];       // e is int[], f is int[][]
int g[][], h[];     // g is int[][], h is int[]
```

Legal and illegal creation expressions:

| Expression | Compiles? | Note |
|---|---|---|
| `int[] a = new int[3];` | yes | `[0, 0, 0]` |
| `int[] a = new int[]{1, 2};` | yes | anonymous array |
| `int[] a = {1, 2};` | yes | shorthand — only in a declaration |
| `a = {1, 2};` (assignment) | **no** | use `a = new int[]{1, 2};` |
| `int[] a = new int[];` | **no** | *array dimension missing* |
| `int[] a = new int[2]{1, 2};` | **no** | dimension **and** initializer |
| `int[3] a;` | **no** | size never goes in the type |
| `int[][] m = new int[3][];` | yes | rows are `null` |
| `int[][] m = new int[][3];` | **no** | the first dimension is required |
| `int[] a = new int[0];` / `new int[]{}` | yes | empty array, `length` 0 |
| `new int[-1]` | compiles | `NegativeArraySizeException` at runtime |
| `var a = {1, 2};` | **no** | `var` needs a type: `var a = new int[]{1, 2};` |

::check D5-ARR-001

```java predict
import java.util.Arrays;
public class Main {
    public static void main(String[] args) {
        int x[] = new int[3], y = 5, z[][] = {{1, 2}, {3}};
        String[] s = new String[2];
        boolean[] flags = new boolean[1];
        double[] d = new double[1];
        System.out.println(x.length + y + z[1][0]);
        System.out.println(Arrays.toString(s) + Arrays.toString(flags) + Arrays.toString(d));
        int[][] ragged = new int[3][];
        ragged[0] = new int[1];
        ragged[1] = new int[]{1, 2, 3};
        System.out.println(Arrays.deepToString(ragged) + " " + ragged.length);
    }
}
```
```output
11
[null, null][false][0.0]
[[0], [1, 2, 3], null] 3
```

`x.length + y + z[1][0]` is `3 + 5 + 3`. The third row of `ragged` was never assigned, so it is `null` —
reading `ragged[2][0]` would throw `NullPointerException`, not `ArrayIndexOutOfBoundsException`.

## Covariance and ArrayStoreException

If `Integer` is a subtype of `Number`, then `Integer[]` is a subtype of `Number[]` (arrays are
**covariant**). This compiles, because the compiler only knows the static type `Number[]`:

```java predict
public class Main {
    public static void main(String[] args) {
        Integer[] nums = {1, 2};
        Number[] view = nums;          // fine: Integer[] is a Number[]
        System.out.println(view[0]);
        view[1] = 3.5;                 // a Double is a Number... but the array is really an Integer[]
        System.out.println("never");
    }
}
```
```output
1
Exception in thread "main" java.lang.ArrayStoreException: java.lang.Double
```

Every array object remembers its real component type, and each store into a reference array is checked at
runtime. Primitive arrays are not covariant at all: `long[] l = new int[2];` and `Object[] o = new int[2];`
do not compile (an `int[]` *is* an `Object`, though: `Object o = new int[2];` is fine).

> [!NOTE]
> Generics chose the opposite design: `List<Integer>` is **not** a `List<Number>`. That makes the mistake a
> compile-time error instead of a runtime one — see the generics lesson.

::check D5-ARR-002

## The java.util.Arrays toolbox

| Method | What it does | Watch out |
|---|---|---|
| `toString(a)` | `[1, 2, 3]` | for `int[][]` prints row identities like `[[I@…]`; use `deepToString` |
| `equals(a, b)` | same length and pairwise `equals` | one level only; use `deepEquals` for nested arrays |
| `compare(a, b)` | lexicographic: first mismatch decides; a proper prefix is smaller | the value is only defined by its **sign** (it can be −2, not just −1) |
| `mismatch(a, b)` | index of the first difference, `-1` if equal | prefix ⇒ the length of the shorter array |
| `sort(a)` | ascending natural order (in place) | `String`s: uppercase before lowercase |
| `sort(a, cmp)` | with a `Comparator` | object arrays only — not for `int[]` |
| `binarySearch(a, key)` | index if found, else `-(insertionPoint) - 1` | array must be sorted, otherwise the result is **undefined** |
| `fill(a, v)`, `copyOf(a, n)`, `copyOfRange(a, from, to)` | utilities | `copyOf` pads with defaults |
| `asList(T...)` | fixed-size `List` view **backed by** the array | not for primitives: `asList(int[])` is a `List<int[]>` of size 1 |

```java predict
import java.util.Arrays;
public class Main {
    public static void main(String[] args) {
        int[] x = {3, 1, 2};
        int[] y = {3, 1, 2};
        System.out.println(x.equals(y) + " " + Arrays.equals(x, y));
        System.out.println(Arrays.compare(new int[]{1, 2}, new int[]{1, 3}) + " "
                + Arrays.compare(new int[]{1, 2}, new int[]{1, 2}));
        System.out.println(Arrays.mismatch(new int[]{1, 2, 3}, new int[]{1, 2, 4}) + " "
                + Arrays.mismatch(new int[]{1, 2}, new int[]{1, 2, 3}));
        String[] words = {"banana", "Apple", "cherry", "apple"};
        Arrays.sort(words);
        System.out.println(Arrays.toString(words));
        int[] sorted = {10, 20, 30, 40};
        System.out.println(Arrays.binarySearch(sorted, 30) + " "
                + Arrays.binarySearch(sorted, 25) + " "
                + Arrays.binarySearch(sorted, 5) + " "
                + Arrays.binarySearch(sorted, 50));
    }
}
```
```output
false true
-1 0
2 2
[Apple, apple, banana, cherry]
2 -3 -1 -5
```

Reading the binary-search results: `25` would be inserted at index 2 ⇒ `-(2) - 1 = -3`; `5` at index 0 ⇒
`-1`; `50` at index 4 (the end) ⇒ `-5`. A "not found" result is therefore always **negative**, even when the
insertion point is 0.

> [!TRAP]
> The exam likes `binarySearch` on an **unsorted** array. The Javadoc says the result is *undefined* — the
> correct answer is "the result cannot be predicted", not whatever a manual binary search gives.

### `Arrays.asList` — a fixed-size window onto the array

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        String[] arr = {"a", "b", "c"};
        List<String> list = Arrays.asList(arr);
        list.set(0, "z");          // writes through to arr
        arr[2] = "y";              // visible through list
        System.out.println(list + " " + Arrays.toString(arr));
        try {
            list.add("d");
        } catch (UnsupportedOperationException e) {
            System.out.println("cannot add");
        }
        int[] prim = {1, 2, 3};
        System.out.println(Arrays.asList(prim).size());
    }
}
```
```output
[z, b, y] [z, b, y]
cannot add
1
```

`Arrays.asList(prim)` cannot box an `int[]` into `Integer`s; `T` is inferred as `int[]`, giving a one-element
`List<int[]>`. Unlike `List.of`, `Arrays.asList` **allows `null` elements** and supports `set` and `sort`.

::check D5-ARR-003

## What if…? One change at a time

| Change | Result |
|---|---|
| `int[] a, b;` → `int a[], b;` then `b = new int[2];` | compile error: `b` is an `int` |
| `new int[2]{1, 2}` | compile error: dimension and initializer |
| `int[][] g = new int[3][]; g[1][0] = 1;` | `NullPointerException` (row is null) |
| `a[a.length]` | `ArrayIndexOutOfBoundsException` |
| `Object[] o = new String[1]; o[0] = 1;` | compiles; `ArrayStoreException` at runtime |
| `binarySearch` on `{10, 20, 30, 40}` for `35` | `-4` (insertion point 3) |
| `Arrays.asList(arr).remove(0)` | `UnsupportedOperationException` |
| `Arrays.equals(int[][], int[][])` with equal content | `false` — rows compared by identity; use `deepEquals` |

## Exam traps checklist

> [!TRAP]
> - `args.length` (field) vs `s.length()` (String method) vs `list.size()` — the exam mixes them up on purpose.
> - Default values apply to array **elements** even inside methods; an unassigned local **array variable** is
>   still a compile error if read.
> - `int[] a = {1, 2}; int[] b = a; b[0] = 9;` changes `a[0]` — both reference one object. `a.clone()` makes a
>   shallow copy.
> - `Arrays.sort` on `String[]` sorts by Unicode value: `"Zebra"` comes before `"apple"`.
> - `Arrays.compare` returns a value whose **sign** matters; e.g. a proper prefix returns
>   `a.length - b.length`.
