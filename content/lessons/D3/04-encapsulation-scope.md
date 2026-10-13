---
id: oop-encapsulation-scope
domain: D3
order: 4
title: Scope, Access Control, Immutability, var & Unnamed Variables
summary: Where each kind of variable lives and dies, shadowing and definite assignment, the four access levels (including the cross-package protected rule), how to build a truly immutable class, and the exact rules for var and Java 22's unnamed variable _.
minutes: 55
objectives: [D3.4]
prerequisites: [oop-objects-lifecycle]
contract:
  - Determine the scope of local, instance and class variables and spot redeclaration, shadowing and "might not have been initialized" errors.
  - Decide whether a member is accessible from a given place for each access level — including protected access through a subclass reference in another package.
  - Write an immutable class with defensive copies in and out, and explain why final fields alone are not enough.
  - Decide whether a var declaration compiles and what type it infers.
  - Use the unnamed variable _ (JEP 456) in every allowed context and recognise the forbidden ones.
keyRules:
  - "Local variables: scope from declaration to end of block, no default value, must be definitely assigned before reading. Fields get default values."
  - A local variable may not be redeclared while another local of the same name is in scope (nested blocks and lambda bodies included); a local may shadow a field — use this.x / ClassName.x to reach it.
  - "Access: private = top-level class body only; package-private (no modifier) = same package; protected = same package + subclasses; public = everywhere."
  - Outside its package, a protected instance member is accessible in subclass S only through a reference of type S (or a subtype), never through a superclass reference.
  - "Immutable class: final class, private final fields, no setters, defensive copies of mutable inputs and outputs (or unmodifiable copies such as List.copyOf)."
  - "var: local variables only (incl. for/for-each/try-with-resources and lambda params), needs an initializer, not null alone, not an array initializer, one variable per declaration. var is a reserved type name, not a keyword."
  - "Unnamed variable _ (JEP 456, Java 22): locals, loop variables, catch parameters, resources, lambda parameters and patterns — never fields or method parameters, never readable, may repeat in one scope."
retrieval:
  - List the four kinds of variable scope in Java and when each variable is created and destroyed.
  - Explain the protected rule across packages with a two-class example.
  - Name five places where var is not allowed.
  - Name five places where _ may be used and two where it may not.
checks: [D3-SCP-002, D3-SCP-003]
mastery: [D3-SCP-004, D3-SCP-006, D3-SCP-007, D3-SCP-008, D3-SCP-010]
---

## Mental model: every name has a region where it means something

The **scope** of a declaration is the part of the program where its simple name can be used. Java has three
kinds of variables, with very different lifetimes:

| Kind | Declared | Scope | Lifetime | Default value |
|---|---|---|---|---|
| local (incl. parameters) | in a method, constructor, block, `for`, `catch`, lambda | from declaration to the end of its block | while the block executes | **none** — must be assigned before use |
| instance variable | in the class body, no `static` | the whole class body (instance code) | as long as the object | `0` / `false` / `null` |
| class variable | in the class body, `static` | the whole class body | as long as the class is loaded | `0` / `false` / `null` |

When two declarations with the same name are in scope, the **innermost one shadows** the outer one. Fields
remain reachable with `this.name` (instance) or `ClassName.name` (static).

```java predict
public class Main {
    static int total = 100;          // class variable
    int count = 1;                   // instance variable
    void add(int count) {            // parameter shadows the field
        int total = 5;               // local shadows the static field
        this.count += count;
        Main.total += total;
        System.out.println(count + " " + this.count + " " + total + " " + Main.total);
    }
    public static void main(String[] args) {
        Main a = new Main(), b = new Main();
        a.add(10);
        b.add(20);
    }
}
```
```output
10 11 5 105
20 21 5 110
```

Each object has its own `count`; there is only one `Main.total`, shared by both.

## Local variable rules the compiler enforces

**No redeclaration while in scope.** A local may not have the same name as another local (or parameter)
that is still in scope — nested blocks, `for` headers, `catch` parameters and lambda parameters included.
Once the outer variable's block has ended, the name is free again.

```java predict
public class Main {
    public static void main(String[] args) {
        int x = 1;
        for (int i = 0; i < 3; i++) {
            int x = i;
        }
    }
}
```
```output
Compilation fails: variable x is already defined in method main(java.lang.String[])
```

Reverse the order — `{ int y = 2; } int y = 3;` — and it compiles: the inner `y` is already out of scope.
A loop variable declared in a `for` header disappears after the loop: using `i` afterwards is
*cannot find symbol*.

**Definite assignment.** A local must be *definitely assigned* on every path before it is read. The
compiler analyses control flow but only treats **constant expressions** as known `true`/`false`:

```java predict
public class Main {
    public static void main(String[] args) {
        int result;
        if (args.length > 5) {
            result = 1;
        } else if (args.length == 0) {
            result = 2;
        }
        System.out.println(result);
    }
}
```
```output
Compilation fails: variable result might not have been initialized
```

There is no final `else`, so one path leaves `result` unassigned. Adding `else result = 3;` fixes it.
`boolean ok = true; if (ok) n = 1;` also fails — `ok` is not a constant variable — but with
`final boolean ok = true;` the condition is a constant expression and the code compiles.

> [!TRAP]
> Fields never cause *might not have been initialized* (except blank `final` fields in constructors) —
> they have defaults. But `int total = total + 1;` inside a method declares a **local** `total` and reads
> it in its own initializer: *variable total might not have been initialized*, even if a field `total`
> exists.

::check D3-SCP-002

::check D3-SCP-003

## Access modifiers and encapsulation

| Modifier | Same class | Same package | Subclass in another package | Anywhere |
|---|---|---|---|---|
| `private` | ✓ | | | |
| *(none)* package-private | ✓ | ✓ | | |
| `protected` | ✓ | ✓ | ✓ (with the rule below) | |
| `public` | ✓ | ✓ | ✓ | ✓ |

`private` is enforced per **top-level class**, not per object: a method can read `other.secret` of another
instance of the same class, and nested classes share private access with their enclosing class.

**The protected rule.** Outside the package, a subclass may access a protected *instance* member only
through references whose type is **the subclass itself (or its subclasses)** — `this`, `super`, or a
variable of the subclass type. It may not use a variable of the superclass type, because that object might
be some unrelated subclass's instance.

```java
package zoo;
public class Animal {
    protected String name = "generic";
    protected Animal() { }
    protected void eat() { System.out.println(name + " eats"); }
}

package safari;
import zoo.Animal;
public class Lion extends Animal {
    void test(Lion other, Animal plain) {
        eat();              // OK — via this
        name = "lion";      // OK — via this
        other.eat();        // OK — reference type is Lion
        plain.eat();        // ERROR: eat() has protected access in zoo.Animal
        new Animal();       // ERROR: Animal() has protected access in zoo.Animal
        new Animal() { };   // OK — anonymous subclass calls the protected constructor via super()
    }
}
```

A protected **constructor** can be used from another package only via `super(...)` (including the implicit
call from an anonymous subclass), never via a plain `new Animal()`. Inside package `zoo`, all of the above
compile — protected includes package access.

**Encapsulation** = hide the state (`private` fields) and expose behaviour through methods that keep the
object valid. A setter that validates, a getter that returns a copy, no public mutable fields.

## Immutable objects

An immutable object's state can never change after construction. Recipe:

1. Make the class `final` (or all constructors private) so no subclass can add mutable state or override
   accessors.
2. Make every field `private final`.
3. No setters; "changes" return a **new** object (`withX(...)`).
4. **Defensive copies** of mutable inputs (copy in) and of mutable state you return (copy out) — or store
   unmodifiable copies such as `List.copyOf(...)` which can be shared safely.

```java predict
import java.util.*;
final class Route {
    private final String name;
    private final List<String> stops;
    private final int[] times;
    Route(String name, List<String> stops, int[] times) {
        this.name = Objects.requireNonNull(name);
        this.stops = List.copyOf(stops);        // defensive, unmodifiable copy in
        this.times = times.clone();             // arrays: copy in ...
    }
    String name() { return name; }
    List<String> stops() { return stops; }      // already unmodifiable: safe to share
    int[] times() { return times.clone(); }     // ... and copy out
    Route withStop(String stop, int time) {
        List<String> s = new ArrayList<>(stops); s.add(stop);
        int[] t = Arrays.copyOf(times, times.length + 1); t[times.length] = time;
        return new Route(name, s, t);
    }
}
public class Main {
    public static void main(String[] args) {
        List<String> stops = new ArrayList<>(List.of("Tunis"));
        int[] times = {0};
        Route r = new Route("TGM", stops, times);
        stops.add("Sousse");
        times[0] = 99;
        r.times()[0] = 42;
        Route r2 = r.withStop("La Marsa", 35);
        System.out.println(r.stops() + " " + Arrays.toString(r.times()));
        System.out.println(r2.stops() + " " + Arrays.toString(r2.times()));
        try { r.stops().add("X"); } catch (UnsupportedOperationException e) { System.out.println("unmodifiable"); }
    }
}
```
```output
[Tunis] [0]
[Tunis, La Marsa] [0, 35]
unmodifiable
```

None of the outside modifications reach `r`. Remove either `clone()` and the corresponding `99` or `42`
leaks into the object.

> [!TRAP]
> **Copy vs view.** `Collections.unmodifiableList(src)` is a read-only **view**: callers cannot modify it,
> but changes to `src` show through. `List.copyOf(src)` is an independent unmodifiable **copy** (and it
> rejects `null` elements). For immutability, you need the copy.

> [!REAL]
> Records are a shortcut for "final class + private final fields + accessors", but they do **not** copy
> mutable components for you: `record Team(List<String> members)` is only immutable if its compact
> constructor does `members = List.copyOf(members);`.

::exercise D3-EX-002

## Local variable type inference: `var`

`var` lets the compiler infer a **local** variable's type from its initializer. The variable is still
statically typed — the type is fixed at compile time:

```java predict
import java.util.*;
public class Main {
    public static void main(String[] args) {
        var names = new ArrayList<String>();
        names.add("Ada");
        var first = names.get(0);
        var total = 0L;
        for (var n : names) total += n.length();
        var arr = new int[] {1, 2};
        System.out.println(first.toUpperCase() + " " + total + " " + arr.length);
        var var = "var is not a keyword";
        System.out.println(var);
    }
}
```
```output
ADA 3 2
var is not a keyword
```

| Allowed | Not allowed (message fragment) |
|---|---|
| local variables with an initializer | no initializer: `var x;` (*cannot use 'var' on variable without initializer*) |
| `for` / for-each variables, try-with-resources | `var n = null;` (*variable initializer is 'null'*) |
| lambda parameters `(var a, var b) -> …` (all or none) | `var a = {1, 2};` (*array initializer needs an explicit target-type*) |
| `var` as a variable, method or package name | `var f = () -> 1;` (*lambda expression needs an explicit target-type*) |
| | fields, method parameters, return types, `catch` parameters (*'var' is not allowed here*) |
| | `var a = 1, b = 2;` (*not allowed in a compound declaration*), `var x[] = …` |
| | a class, interface or record named `var` (*restricted type name*) |

`var x = 10; x = "ten";` fails — `x` is an `int`. `var list = new ArrayList<>();` compiles but infers
`ArrayList<Object>`. In lambdas, `(var a, b) -> …` mixing styles is an error, while `(final var a, final var b)`
is the way to add modifiers or annotations to lambda parameters.

> [!TRAP]
> `var` infers the **exact static type of the initializer**: `var c = 'a';` is a `char`, but
> `var d = c + 1;` is an `int` (numeric promotion). `var s = (short) 3;` is a `short`.

## Unnamed variables `_` (Java 22+)

> [!J25]
> **JEP 456**, final since Java 22 and part of Java 25: an underscore declares an **unnamed variable** (or
> unnamed pattern) — a variable you must declare but never use. Before Java 9 `_` was an identifier; from 9
> to 21 it was an error; since 22 it has this meaning.

```java predict
import java.util.*;
import java.util.function.*;
public class Main {
    record Point(int x, int y) { }
    public static void main(String[] args) {
        Map<String, Integer> stock = new TreeMap<>(Map.of("apple", 3, "pear", 0));
        int inStock = 0;
        for (var _ : stock.keySet()) inStock++;
        BiConsumer<String, Integer> printKey = (k, _) -> System.out.print(k + " ");
        stock.forEach(printKey);
        System.out.println(inStock);
        try { Integer.parseInt("oops"); }
        catch (NumberFormatException _) { System.out.println("not a number"); }
        Object o = new Point(3, 4);
        if (o instanceof Point(var x, _)) System.out.println("x=" + x);
        var _ = stock.remove("pear");
        var _ = stock.remove("apple");
        System.out.println(stock.isEmpty());
    }
}
```
```output
apple pear 2
not a number
x=3
true
```

- **Allowed:** local variable declarations, basic `for` and enhanced-for variables, `catch` parameters,
  try-with-resources resources, lambda parameters, and in record/type patterns (`Point(var x, _)`,
  `case Point _`).
- **Several `_` in the same scope** are fine — they introduce no name. Their initializers still run.
- **Not allowed:** fields, method and constructor parameters, and reading `_` as an expression
  (*underscore not allowed here*).

> [!TRAP]
> `int _ = 5; System.out.println(_);` does not compile — an unnamed variable can never be referenced.
> And `void m(int _)` is illegal: only **lambda** parameters can be unnamed, not method parameters.

## What if…? One change at a time

| Change | Result |
|---|---|
| Declare `int x` in a loop body while an outer `x` is in scope | *variable x is already defined* |
| Declare the same name after the inner block has closed | compiles |
| Lambda parameter named like an enclosing local: `String s; f = s -> …` | *variable s is already defined* |
| `if (flag) n = 1;` with `final boolean flag = true;` | compiles (constant expression) |
| Subclass in another package calls `superTypeRef.protectedMethod()` | *has protected access* |
| Same call from a class in the superclass's package | compiles |
| Return the internal `ArrayList` from an accessor of a "final" class | callers can mutate state — not immutable |
| `var a = new int[]{1,2};` instead of `var a = {1,2};` | compiles |
| `(var a, b) -> a + b` | *cannot mix 'var' and implicitly-typed parameters* |
| `static int _ = 1;` | *underscore not allowed here* |

## Exam traps checklist

> [!TRAP]
> - Local variables have **no default value**; fields and array elements do.
> - Shadowing is legal (local vs field); redeclaring a local in a nested scope is not.
> - `protected` across packages: access via `this`/subclass-typed reference only.
> - `final` on a reference field freezes the reference, not the object.
> - `Collections.unmodifiableList` is a view; `List.copyOf` is a copy.
> - `var` is not a keyword: `var var = 1;` compiles; `class var {}` does not.
> - `_` cannot be read, cannot be a field, cannot be a method parameter.

## Practice

::check D3-SCP-001

::check D3-SCP-005

::check D3-SCP-009

::check D3-SCP-011
