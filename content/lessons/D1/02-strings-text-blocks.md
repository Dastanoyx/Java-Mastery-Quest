---
id: values-strings-text
domain: D1
order: 2
title: String, StringBuilder & Text Blocks
summary: Immutable strings and the string pool, concatenation order, the String API that the exam loves (substring, strip, split, indent, compareTo …), mutable StringBuilder, and the exact whitespace rules of text blocks.
minutes: 55
objectives: [D1.2]
prerequisites: [values-primitives-operators]
contract:
  - Predict whether two String references are `==`, using the rules for the string pool, compile-time constants and `intern()`.
  - Evaluate `+` chains that mix numbers, chars and strings, strictly left to right.
  - Trace calls to String and StringBuilder methods, including index boundaries and which calls return a new object versus mutating the receiver.
  - Compute the exact content of a text block, including incidental whitespace, the trailing newline, `\` line continuation and `\s`.
keyRules:
  - "String is immutable: every 'modifying' method returns a new String. Calling `s.toUpperCase();` without assigning the result changes nothing."
  - "String literals and compile-time constant expressions (literals and final constant variables joined with +) are interned; strings built at runtime are new objects."
  - "`+` is left-associative: `1 + 2 + \"3\"` is \"33\", `\"1\" + 2 + 3` is \"123\". Once a String appears, the rest concatenates."
  - "substring(begin, end) includes begin and excludes end; end may equal length(). Out-of-range indexes throw StringIndexOutOfBoundsException."
  - "trim() removes characters ≤ U+0020; strip() removes all Unicode whitespace. isBlank() is true for empty or whitespace-only."
  - "split(regex) drops trailing empty strings but keeps leading ones; split(regex, -1) keeps them all. The argument is a regex: split(\".\") splits on every character."
  - "StringBuilder is mutable and its methods return `this` for chaining; it does NOT override equals()."
  - "Text block: content starts on the line after the opening `\"\"\"`; the common minimum indentation (including the closing delimiter's line) is removed; trailing spaces are stripped; a closing delimiter on its own line adds a final newline."
retrieval:
  - "Write down what `\"\" + 1 + 2`, `1 + 2 + \"\"` and `'a' + 'b' + \"c\"` evaluate to."
  - List five StringBuilder methods that mutate the receiver and one String method with the same name that does not.
  - Explain how javac decides how much indentation to remove from a text block.
  - Name two escape sequences that exist mainly for text blocks and what each does.
checks: [D1-STR-004]
mastery: [D1-STR-001, D1-STR-003, D1-STR-005, D1-STR-007, D1-STR-009, D1-STR-010]
---

## Mental model: a String is a value you can only replace

A `String` object never changes after construction. Methods such as `toUpperCase()`, `replace()`,
`concat()`, `strip()` and `substring()` **return a new String** (or the same one if nothing changed) and
leave the receiver untouched. If you do not keep the return value, the work is lost:

```java
String s = "hello";
s.toUpperCase();          // result discarded
s.concat(" world");       // result discarded
System.out.println(s);    // hello
```

Because strings are immutable, the JVM can safely **share** them. Every string literal and every
**compile-time constant expression** of type String is placed in the **string pool**: all occurrences of
`"java"` in all classes refer to one object. Strings created at runtime (`new String(...)`,
concatenation involving a non-constant variable, `substring`, `StringBuilder.toString()`) are separate
objects — unless you call `intern()`, which returns the pooled instance.

`StringBuilder` is the opposite: one mutable buffer whose methods change it in place and return the
**same** builder so you can chain calls.

## Identity: the pool, constants and `intern()`

```java predict
public class Main {
    public static void main(String[] args) {
        String a = "java";
        String b = "ja" + "va";              // constant expression → folded at compile time
        String c = new String("java");       // always a new object
        String part = "ja";
        String e = part + "va";              // part is not final → built at runtime
        final String fp = "ja";
        String f = fp + "va";                // fp is a constant variable → folded
        System.out.println((a == b) + " " + (a == c) + " " + (a == c.intern()));
        System.out.println((a == e) + " " + (a == f) + " " + a.equals(e));
    }
}
```
```output
true false true
false true true
```

A **constant variable** is a `final` variable of primitive or `String` type initialised with a constant
expression. `fp + "va"` is therefore itself a constant expression and is interned; `part + "va"` is not.

> [!TRAP]
> `==` on Strings compares **references**. Exam code often compares a literal with a runtime-built string
> and expects you to notice `false`. Use `equals` (or `equalsIgnoreCase`) for content.

## Concatenation: strictly left to right

`+` is left-associative and means numeric addition until one operand is a String; from then on everything
concatenates. A `char` is numeric until it meets a String.

```java predict
public class Main {
    public static void main(String[] args) {
        System.out.println("1" + 2 + 3);
        System.out.println(1 + 2 + "3");
        System.out.println('1' + 2 + "3");       // '1' is 49
        System.out.println(1 + 2 + "3" + 4 + 5);
        System.out.println("" + null + 1);
        String s = null;
        s += "x";
        System.out.println(s);
    }
}
```
```output
123
33
513
3345
null1
nullx
```

`null` concatenates as the four characters `null` — no exception.

::check D1-STR-002

## The String API you must know cold

| Call | Result | Notes |
|---|---|---|
| `"abcdef".substring(2, 4)` | `"cd"` | begin inclusive, end exclusive |
| `"abcdef".substring(6)` | `""` | begin may equal `length()` |
| `"abc".substring(2, 1)` | **`StringIndexOutOfBoundsException`** | begin > end |
| `"abc".charAt(3)` | **`StringIndexOutOfBoundsException`** | valid: 0 … length-1 |
| `"banana".indexOf("an", 2)` | `3` | search starts at index 2; `-1` if absent |
| `"banana".lastIndexOf('a')` | `5` | |
| `"aaa".replace("aa", "b")` | `"ba"` | literal, left to right, non-overlapping |
| `"x.y".replaceAll(".", "#")` | `"###"` | `replaceAll` takes a **regex** |
| `"  hi  ".strip()` / `stripLeading()` / `stripTrailing()` | `"hi"` / `"hi  "` / `"  hi"` | Unicode-aware |
| `" hi".trim()` | unchanged | `trim` only removes chars ≤ `' '` (U+0020) |
| `"   ".isBlank()` / `"   ".isEmpty()` | `true` / `false` | `isEmpty` is `length() == 0` |
| `"ab".repeat(3)` | `"ababab"` | `repeat(0)` is `""`; negative throws |
| `"a\nb\r\nc".lines().count()` | `3` | splits on `\n`, `\r`, `\r\n` |
| `"a\nb".indent(2)` | `"  a\n  b\n"` | adds/removes spaces per line **and normalises to end with `\n`** |
| `"Hi %s".formatted("Ann")` | `"Hi Ann"` | instance version of `String.format` |
| `"a\\tb".translateEscapes()` | `"a<TAB>b"` | interprets escape sequences at runtime |
| `"apple".compareTo("apricot")` | `-2` | first differing char: `'p' - 'r'` |
| `"abc".compareTo("abcde")` | `-2` | one is a prefix: difference of lengths |
| `"Zoo".compareTo("zoo")` | `-32` | uppercase sorts before lowercase |
| `String.join("/", "a", "b")` | `"a/b"` | also accepts an `Iterable` |
| `"hello".chars()` | `IntStream` of 104, 101, … | `int` values, not `char` |

`split` deserves its own table, because it surprises everyone:

| Call | Length | Elements |
|---|---|---|
| `",a,,b,,".split(",")` | 4 | `"", "a", "", "b"` — **trailing** empties removed, leading kept |
| `",a,,b,,".split(",", -1)` | 6 | all kept, including the two trailing `""` |
| `"a.b.c".split(".")` | 0 | `.` is a regex matching every char; everything is empty → all removed |
| `"".split(",")` | 1 | `[""]` — the input itself, no match |

```java predict
public class Main {
    public static void main(String[] args) {
        String s = "  Java 25  ";
        s.strip();
        String t = s.strip().toLowerCase().replace('a', 'o');
        System.out.println("[" + s + "] [" + t + "]");
        System.out.println(t.substring(t.indexOf(' ') + 1) + t.charAt(0));
        System.out.println("hello".charAt(1) + 1);
        System.out.println(String.join("|", "a,b,,c,,".split(",")));
    }
}
```
```output
[  Java 25  ] [jovo 25]
25j
102
a|b||c
```

`charAt` returns a `char`; `'e' + 1` is the `int` 102.

## StringBuilder: one mutable buffer

| Method | Effect on `new StringBuilder("abcdef")` |
|---|---|
| `append(x)` | appends `String.valueOf(x)` — `append((String) null)` appends `"null"` |
| `insert(2, "-")` | `"ab-cdef"`; offset may equal `length()`, larger throws |
| `delete(1, 3)` | removes indexes 1–2 → `"adef"`; `end` may exceed length (clamped) |
| `deleteCharAt(0)` | `"bcdef"` |
| `replace(0, 3, "X")` | `"Xdef"` — replaces a **range**, unlike `String.replace` |
| `reverse()` | `"fedcba"` |
| `setLength(3)` | `"abc"`; growing pads with `'\u0000'` |
| `substring(1, 3)`, `indexOf`, `charAt`, `length` | read-only, like String; `substring` returns a **String** |

Every mutator returns `this`, so the variables below refer to **the same** object:

```java predict
public class Main {
    public static void main(String[] args) {
        StringBuilder sb = new StringBuilder("abcdef");
        sb.insert(2, "-").delete(4, 6).deleteCharAt(0).reverse();
        System.out.println(sb);
        StringBuilder s1 = new StringBuilder("a");
        StringBuilder s2 = s1.append("b");
        s2.append("c");
        System.out.println(s1 + " " + (s1 == s2));
        StringBuilder x = new StringBuilder("x"), y = new StringBuilder("x");
        System.out.println(x.equals(y) + " " + x.toString().equals(y.toString()) + " " + "x".contentEquals(x));
    }
}
```
```output
fc-b
abc true
false true true
```

Trace the chain: `ab-cdef` → `delete(4, 6)` removes `de` → `ab-cf` → `deleteCharAt(0)` → `b-cf` →
`reverse()` → `fc-b`.

`StringBuilder` inherits `equals` from `Object` (identity). Compare contents with
`a.toString().equals(b.toString())`, `a.compareTo(b) == 0` (since Java 11) or `"…".contentEquals(sb)`.
Capacity (`new StringBuilder(2)`) is only a performance hint; the builder grows as needed and capacity is
never part of an exam answer's output.

> [!TRAP]
> `String.replace(char, char)` / `replace(CharSequence, CharSequence)` replaces **occurrences** and returns a
> new String; `StringBuilder.replace(int start, int end, String)` replaces a **range** in place. Same name,
> different signatures, different semantics.

::check D1-STR-006

## Text blocks: the exact whitespace algorithm

A text block starts with `"""` followed by optional spaces and a **line terminator** — `"""abc"""` does not
compile. The content begins on the next line. javac then:

1. Splits the content into lines and computes the **minimum indentation** over all non-blank lines **plus
   the line of the closing delimiter** (if the delimiter is on its own line).
2. Removes that many leading whitespace characters from every line (*incidental whitespace*).
3. Strips **trailing** whitespace from every line.
4. Interprets escape sequences **last** — so `\s` (a space) and `\"""` survive steps 2–3.

Consequences:

- Closing `"""` **on its own line** → the string ends with `\n`. Closing `"""` right after the last word
  → no trailing newline.
- Moving the closing delimiter **left** of the content adds indentation to every line; moving it right of
  the content has no effect (the content is the minimum).
- `\<line-end>` joins the next line without a newline; `\s` is a single space that is not stripped.
- Single `"` and `""` need no escaping; three quotes in a row must be escaped as `\"""`.

```java predict
public class Main {
    public static void main(String[] args) {
        String a = """
            Hello
              World
            """;
        String b = """
              Hello
            World
          """;
        String c = """
            one \
            two
            three\s
            four   
            say "hi" \"""
            """;
        System.out.print(a.replace(' ', '.'));
        System.out.print(b.replace(' ', '.'));
        System.out.print(c.replace(' ', '.'));
        System.out.println(a.length());
    }
}
```
```output
Hello
..World
....Hello
..World
one.two
three.
four
say."hi"."""
14
```

In `b` the closing delimiter is indented 10 spaces while `World` has 12 and `Hello` 14, so 10 are removed.
`a` is `"Hello\n  World\n"`: 5 + 1 + 7 + 1 = 14 characters. The three trailing spaces after `four` are
stripped; the `\s` after `three` is kept.

A text block is just a `String` literal: it is interned, and `"""\n    ab\n    """ == "ab\n"` is `true`.

> [!J25]
> Nothing about text blocks changed in Java 25 — they have been final since Java 15 (JEP 378). The
> related String methods `stripIndent()`, `translateEscapes()` and `formatted()` (Java 15) let you apply the
> same algorithm at runtime.

## What if…? One change at a time

| Change | Result |
|---|---|
| `String e = part + "va"` → make `part` `final` | `a == e` becomes `true` (constant folding) |
| `1 + 2 + "3"` → `"" + 1 + 2 + "3"` | `"123"` instead of `"33"` |
| `s.strip();` → `s = s.strip();` | `s` actually changes |
| `split(",")` → `split(",", -1)` | trailing empty strings are kept |
| `x.equals(y)` (StringBuilders) → `x.compareTo(y) == 0` | `true` for equal content |
| closing `"""` on own line → directly after last word | no trailing `\n` |
| closing `"""` moved 2 columns left of content | every line gains 2 leading spaces |
| `trim()` → `strip()` on `" x"` | the em-space is removed |

## Exam traps checklist

> [!TRAP]
> - `substring(begin, end)` takes **end, not length**: `"abcdef".substring(2, 4)` is `"cd"` (2 chars).
> - `indexOf` returns `-1` when not found; feeding that into `substring` throws.
> - `"a.b".split(".")` has length 0 — the regex `.` matches everything.
> - `StringBuilder sb = "abc";` does not compile; there is no literal syntax for builders.
> - `sb.append(…)` changes `sb` even if you ignore the return value; `str.concat(…)` does nothing unless assigned.
> - `str1 == str2` can be `true` for two literals in different classes — they share the pool.
> - `isEmpty()` vs `isBlank()`: `" ".isEmpty()` is `false`, `" ".isBlank()` is `true`.

## Practice

::check D1-STR-008

::check D1-STR-011
