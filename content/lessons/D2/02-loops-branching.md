---
id: flow-loops-branching
domain: D2
order: 2
title: Loops, Labels, break/continue & Reachability
summary: while, do-while, basic for and enhanced for loops, what happens when you modify the loop variable, labelled break and continue, and the compiler's reachability and definite-assignment analysis that turns innocent-looking loops into compile errors.
minutes: 50
objectives: [D2.1]
prerequisites: [flow-decisions-switch]
contract:
  - Trace while, do-while, for and for-each loops exactly, including loops that modify their own counter and loops over arrays of arrays.
  - Predict the effect of break and continue with and without labels in nested loops.
  - Decide whether a statement is unreachable, citing the rule for while(false), if(false), infinite loops and statements after break/continue/return.
  - Determine whether a local variable is definitely assigned after a loop, using constant-expression rules.
keyRules:
  - "do-while runs its body at least once; while and for test first."
  - "In a basic for loop, the update runs after each body execution (also after continue); variables declared in the init part are scoped to the loop and must share one type."
  - "In an enhanced for loop the variable is a copy of each element; assigning to it does not change the array or collection."
  - "Unlabelled break exits the innermost loop or switch; unlabelled continue skips to the next iteration of the innermost loop. A labelled break/continue targets the labelled statement."
  - "A statement directly after break, continue, return or throw in the same block is unreachable: compile error."
  - "while (false) { … } and for (…; false; …) { … } are compile errors (body unreachable), but if (false) { … } is allowed on purpose (conditional compilation)."
  - "A while(true) loop without a reachable break cannot complete normally: code after it is unreachable, and a non-void method needs no return after it."
  - "Constant expressions (literals and final constant variables) are evaluated by the compiler for reachability and definite assignment; ordinary variables are not."
retrieval:
  - Write the execution order of the four parts of a basic for loop.
  - Explain why while(false) is a compile error but if(false) is not.
  - "Predict what `outer: for (…) { for (…) { continue outer; } }` does differently from an unlabelled continue."
  - Give an example where a variable is definitely assigned after a loop and one where it is not.
checks: [D2-FLW-016]
mastery: [D2-FLW-017, D2-FLW-018, D2-FLW-019, D2-FLW-020, D2-FLW-021, D2-FLW-022]
---

## Mental model: a loop is a test, a body and a jump back

Every loop is "test, run body, go back". The variants differ in **when** the test happens and what runs
between iterations:

| Loop | Test | Runs at least once? | Typical use |
|---|---|---|---|
| `while (cond) body` | before each iteration | no | unknown number of iterations |
| `do body while (cond);` | after each iteration | **yes** | read-then-check |
| `for (init; cond; update) body` | before each iteration; `update` after each body | no | counters |
| `for (T x : arrayOrIterable) body` | hidden iterator/index | no | visiting every element |

`break` leaves a loop (or switch); `continue` abandons the current iteration and goes to the next test
(in a `for` loop: to the **update** first). With a **label**, both can target an outer loop.

The compiler also *reasons* about loops. It knows `while (true)` never ends unless something breaks out,
and that code after it is therefore unreachable. That analysis — **reachability** and **definite
assignment** — produces many "does it compile?" exam questions.

## while, do-while and for in detail

```java predict
public class Main {
    public static void main(String[] args) {
        int k = 10;
        while (k-- > 7) System.out.print(k + " ");
        System.out.println(k);
        int i = 0;
        do i++; while (i < 0);
        System.out.println(i);
        for (int m = 0; m < 5; m++) { m++; System.out.print(m); }
        System.out.println();
        int n = 0;
        for (System.out.print("init "); n < 2; System.out.print("upd ")) {
            System.out.print("body" + n + " ");
            n++;
        }
        System.out.println();
    }
}
```
```output
9 8 7 6
1
135
init body0 upd body1 upd
```

- `k-- > 7` compares the **old** value, then decrements: tests 10, 9, 8 succeed (printing 9, 8, 7),
  the test with 7 fails but still decrements to 6.
- `do … while` executes once although the condition is false from the start.
- Modifying the loop variable inside the body is legal: the body and the update each add 1.
- The init and update sections may contain any expression statements, comma-separated.

`for` loop syntax rules:

- `for (int a = 0, b = 1; …)` declares several variables **of one type**; `for (int i = 0, long j = 0; …)`
  does not compile.
- A variable declared in the init part is out of scope after the loop (*cannot find symbol*); declare it
  before the loop if you need it afterwards.
- Redeclaring the loop variable inside the body (`int j = 5;`) is an error — *already defined*.
- All three parts are optional: `for (;;)` is an infinite loop.
- Without braces, only the next statement is the body — indentation lies:

```java
int i = 0;
while (i < 3)
    i++;
    System.out.print(i);   // NOT in the loop: prints 3 once
```

> [!TRAP]
> `for (int j = 0; j < 3; j++);` — the semicolon is an empty body. The block on the next line runs once,
> after the loop.

## The enhanced for loop

`for (T x : expr)` requires `expr` to be an **array** or an **`Iterable`** (`for (int i : 5)` →
*for-each not applicable to expression type*). The loop variable is a fresh copy of each element:

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        int[] a = {1, 2, 3};
        for (var v : a) { v *= 10; }               // changes the copy only
        System.out.println(Arrays.toString(a));
        for (int n : List.of(1, 2, 3)) System.out.print(n * 2);   // unboxing Integer → int
        System.out.println();
        int count = 0;
        for (String _ : new String[]{"x", "y", "z"}) count++;    // unnamed variable (Java 22+)
        System.out.println(count);
        List<Integer> list = new ArrayList<>(List.of(1, 2, 3));
        for (Integer v : list) { if (v == 1) list.remove(v); }
    }
}
```
```output
[1, 2, 3]
246
3
Exception in thread "main" java.util.ConcurrentModificationException
```

Structurally modifying an `ArrayList` while iterating it with for-each makes the hidden iterator fail fast
with `ConcurrentModificationException`. (Removing the **second-to-last** element happens to escape the
check, because `hasNext()` returns false before the next `next()` call — never rely on that.) Use
`list.removeIf(...)` or an explicit `Iterator.remove()`.

`var` is allowed for the loop variable, and the variable may be `final`.

::check D2-FLW-015

## break, continue and labels

```java predict
public class Main {
    public static void main(String[] args) {
        outer:
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                if (j == 1) continue outer;
                if (i == 2) break outer;
                System.out.print(i + "" + j + " ");
            }
        }
        System.out.println();
        int x = 0;
        while (x < 5) {
            x++;
            if (x % 2 == 0) continue;
            System.out.print(x);
        }
        System.out.println();
        int count = 0;
        loop:
        while (true) {
            switch (count++) {
                case 3: break loop;      // a plain break would only leave the switch
                default: continue loop;
            }
        }
        System.out.println(count);
    }
}
```
```output
00 10
135
4
```

- `continue outer` ends the inner loop **and** the current outer iteration; the outer update `i++` runs.
- Inside a `switch` that sits in a loop, an unlabelled `break` exits the **switch**, not the loop. A label
  is the clean way to leave the loop from inside the switch.
- A label can be placed on any statement, even a block: `lbl: { …; break lbl; … }`. But `continue` needs a
  label that names a **loop**, and the label must enclose the jump (*undefined label*).
- `count++` in the selector uses the old value: the switch sees 0, 1, 2, 3; `count` ends at 4.

## Reachability: when the compiler refuses dead code

The JLS defines precisely which statements are **reachable** (JLS §14.22). The ones the exam tests:

| Code | Compiles? | Why |
|---|---|---|
| `return; x++;` | ✗ *unreachable statement* | nothing after `return`/`throw`/`break`/`continue` in the same block |
| `while (false) { … }` | ✗ | the body can never run |
| `for (…; false; …) { … }` | ✗ | same rule |
| `final boolean F = false; while (F) { … }` | ✗ | `F` is a constant variable — still a constant expression |
| `boolean f = false; while (f) { … }` | ✓ | not a constant: the compiler does not track its value |
| `if (false) { … }` | ✓ | deliberately exempt so you can write debug switches |
| `do { … } while (false);` | ✓ | the body runs once |
| `while (true) { }` followed by any statement | ✗ | the loop can't complete normally (no `break`) |
| `while (true) { …; break; }` followed by a statement | ✓ | a reachable `break` lets the loop complete |
| `case 3: break; System.out.println();` | ✗ | statement after `break` in the same group |

```java predict
public class Main {
    public static void main(String[] args) {
        for (int i = 0; i < 3; i++) {
            if (i == 1) continue;
            System.out.print(i);
        }
        for (int i = 0; i < 3; i++) {
            continue;
            System.out.print(i);
        }
    }
}
```
```output
Compilation fails: unreachable statement
```

The first loop is fine — `continue` is inside an `if`, so the print is reachable. In the second, the print
follows an unconditional `continue`.

**Methods and infinite loops.** A non-void method must not be able to "fall off" its end. A loop that
cannot complete normally counts as never falling off:

```java
static int f() { while (true) { } }                        // compiles: no return needed
static int g(int n) { while (true) { if (n > 10) return n; n *= 2; } }  // compiles
static int h(int n) { while (n < 10) { n *= 2; } }         // error: missing return statement
```

> [!TRAP]
> `if (false)` compiles but `while (false)` does not. The exam pairs them in multi-select questions; the
> difference is a deliberate design choice in JLS §14.22, not an inconsistency you can reason away.

## Definite assignment through loops

A local variable must be **definitely assigned** before it is read (JLS chapter 16). The compiler again
evaluates **only constant expressions**:

```java predict
public class Main {
    public static void main(String[] args) {
        int x;
        while (true) { x = 5; break; }   // the only way out is after the assignment
        System.out.println(x);
        int y;
        do { y = 2; } while (false);     // the body always runs once
        System.out.println(y);
        int z;
        if (true) z = 3;                 // constant condition: then-branch always taken
        System.out.println(x + y + z);
    }
}
```
```output
5
2
10
```

Replace `while (true)` with `boolean b = true; while (b)` and `System.out.println(x)` fails with
*variable x might not have been initialized*: for a non-constant condition the compiler must assume the
loop body may never run.

## What if…? One change at a time

| Change | Result |
|---|---|
| `while (i < 0)` → `do … while (i < 0)` | body runs once |
| `for (int i …)` then `println(i)` after the loop | *cannot find symbol* |
| `continue` → `continue outer` | the rest of the inner loop is skipped as well |
| `break` inside a switch in a loop → `break loopLabel` | leaves the loop, not just the switch |
| `while (true) { }` → `while (true) { break; }` | statement after the loop becomes reachable |
| `while (false)` → `if (false)` | compiles |
| `final boolean DEBUG = false; while (DEBUG)` → remove `final` | compiles |
| for-each `list.remove(v)` → `list.removeIf(v -> v == 1)` | no `ConcurrentModificationException` |

## Exam traps checklist

> [!TRAP]
> - Assigning to the for-each variable never changes the array or list.
> - Count iterations carefully when the body also changes the counter.
> - `do { } while (cond)` needs the final semicolon.
> - A label on a non-loop statement works with `break` but not with `continue`.
> - `int i; for (i = 0; …)` — then `i` is usable after the loop and holds the value that failed the test.
> - Unreachable code is a **compile error**, never a warning, for statements; but an unreachable `else` branch of `if (true)` is fine.

## Practice

::check D2-FLW-001

::check D2-FLW-002
