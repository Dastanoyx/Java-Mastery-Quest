---
id: io-streams
domain: D9
order: 1
title: I/O Streams — Bytes, Characters, Decorators & the Console
summary: The java.io stream hierarchy from first principles — byte vs character streams, the decorator chain, end-of-stream signals, charsets, PrintStream vs PrintWriter, flushing and closing wrapped streams, mark/reset, and reading from the console.
minutes: 55
objectives: [D9.1]
prerequisites: [exc-try-with-resources]
contract:
  - Choose the right abstract base class (InputStream, OutputStream, Reader, Writer) and concrete stream for a task, and decide whether a given wrapping chain compiles.
  - Predict the output of read loops, including why read() returns an int, what -1 and a null readLine() mean, and how mark/reset/skip move the position.
  - Explain buffering, flush() and close() — including what a PrintWriter or BufferedWriter has NOT yet written — and the order in which wrapped streams are closed.
  - Bridge bytes and characters with InputStreamReader/OutputStreamWriter and an explicit Charset, and predict how many bytes a string becomes.
  - Read console input with System.in, Scanner, BufferedReader and Console, and explain why System.console() may return null.
keyRules:
  - "Byte streams end in InputStream/OutputStream; character streams end in Reader/Writer. A Reader/Writer wrapper only accepts a Reader/Writer (InputStreamReader/OutputStreamWriter are the bridges)."
  - InputStream.read() returns an int 0–255, or -1 at end of stream; Reader.read() returns 0–65535 or -1; BufferedReader.readLine() returns null at end of stream.
  - "FileOutputStream/FileWriter truncate an existing file unless the append flag (second constructor argument) is true; they create the file if it does not exist."
  - Buffered and Print* writers keep data in memory until flush() or close(); close() flushes first. Closing the outermost wrapper closes the whole chain.
  - "try-with-resources closes resources in reverse declaration order; each wrapper's close() closes the stream it wraps."
  - "PrintStream and PrintWriter never throw IOException from print/println/printf/write; they set an internal error flag you read with checkError()."
  - "PrintWriter autoflush (constructor flag true) only flushes on println, printf and format — not on print or write."
  - mark(readAheadLimit) remembers a position; reset() returns to it; only streams whose markSupported() is true (e.g. BufferedReader, BufferedInputStream, ByteArrayInputStream, StringReader) support it.
  - System.console() returns null when the JVM has no interactive console (input or output redirected, IDEs, CI, this course's runner).
retrieval:
  - Draw the four abstract base classes and place FileReader, BufferedInputStream, PrintWriter, ObjectOutputStream and InputStreamReader under the right one.
  - Explain why `int b = in.read()` is an int and what goes wrong if you store it in a byte before testing for -1.
  - List what happens, in order, when try-with-resources closes `new BufferedWriter(new FileWriter(f))`.
  - State three differences between PrintStream and PrintWriter, and one thing they share.
checks: [D9-IO-001, D9-IO-002, D9-IO-003, D9-IO-004]
mastery: [D9-IO-005, D9-IO-006, D9-IO-007, D9-IO-008, D9-IO-009, D9-IO-010]
---

## Mental model: pipes of bytes, pipes of characters, and decorators

Everything a program reads or writes outside memory — a file, a socket, the terminal — is ultimately a
sequence of **bytes**. Text is an interpretation of those bytes through a **charset** (UTF-8, ISO-8859-1…).
`java.io` therefore has two parallel families:

| | Read | Write | Unit |
|---|---|---|---|
| **Byte streams** | `InputStream` | `OutputStream` | `int` 0–255 per byte |
| **Character streams** | `Reader` | `Writer` | `int` 0–65535 per `char` |

All four are **abstract classes** (not interfaces), and all four implement `Closeable` (so they work in
try-with-resources). The name suffix tells you the family instantly: anything ending in `…Stream` handles
bytes (with the historical exception that `PrintStream` can *also* print text), anything ending in
`…Reader`/`…Writer` handles characters.

Concrete classes come in two kinds:

- **Low-level (node) streams** talk to a real source or sink: `FileInputStream`, `FileOutputStream`,
  `FileReader`, `FileWriter`, `ByteArrayInputStream`, `StringReader`, `StringWriter`…
- **High-level (filter / decorator) streams** wrap *another stream* and add a feature: buffering
  (`BufferedReader`), conversion (`InputStreamReader`), formatting (`PrintWriter`), objects
  (`ObjectOutputStream`). Their constructors take a stream of the right family.

```java
try (var in = new BufferedReader(           // adds buffering + readLine()
                new InputStreamReader(      // bytes → chars, with an explicit charset
                    new FileInputStream("data.txt"), StandardCharsets.UTF_8))) {
    String first = in.readLine();
}
```

Read the chain from the inside out: a file of bytes, decoded into characters, buffered into lines.

> [!RULE]
> A decorator only accepts its own family. `new BufferedReader(new FileInputStream(f))` does **not
> compile** — `BufferedReader` wants a `Reader`. Crossing families requires a bridge:
> `InputStreamReader` (bytes in → chars out) or `OutputStreamWriter` (chars in → bytes out).

## The classes you must recognise

| Class | Family | Wraps | Notes |
|---|---|---|---|
| `FileInputStream` / `FileOutputStream` | byte | `File`, `String` path, `FileDescriptor` | `FileOutputStream(name, boolean append)` |
| `FileReader` / `FileWriter` | char | path | convenience classes; since Java 11 they also accept a `Charset` |
| `BufferedInputStream` / `BufferedOutputStream` | byte | `InputStream` / `OutputStream` | buffering, mark/reset |
| `BufferedReader` / `BufferedWriter` | char | `Reader` / `Writer` | `readLine()`, `lines()` / `newLine()` |
| `InputStreamReader` / `OutputStreamWriter` | bridge | byte stream | decode/encode with a `Charset` |
| `ObjectInputStream` / `ObjectOutputStream` | byte | `InputStream` / `OutputStream` | serialization (next lesson) |
| `PrintStream` | byte (+ text) | `OutputStream`, file | `System.out`, `System.err` |
| `PrintWriter` | char | `Writer`, `OutputStream`, file | text output with `printf` |
| `ByteArrayInputStream` / `…OutputStream`, `StringReader` / `StringWriter` | in-memory | array / string | ideal for tests |

`PrintWriter` is the one decorator that accepts **both** families: `new PrintWriter(Writer)` and
`new PrintWriter(OutputStream)` (it adds the bridge internally).

::check D9-IO-003

## Reading: why read() returns an int, and how a stream ends

`InputStream.read()` returns the next byte as an **unsigned** value 0–255, or **-1** when the stream is
exhausted. It needs 257 distinct results, so the return type is `int`, not `byte`. `Reader.read()` likewise
returns a `char` value 0–65535 or -1. The bulk variant `read(byte[] buf)` returns the **number of bytes
read** (possibly fewer than `buf.length`) or -1 at the end.

```java predict
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        byte[] data = { 72, -1, 105, 0 };
        try (InputStream in = new ByteArrayInputStream(data)) {
            int b;
            while ((b = in.read()) != -1) {
                System.out.print(b + " ");
            }
        }
        System.out.println();
        System.out.println((byte) 255 + " " + (0xFF & (byte) -1));
    }
}
```
```output
72 255 105 0
-1 255
```

The byte `-1` (`0xFF`) is *data*: `read()` returns it as `255`, which is different from the end marker `-1`.
A loop that casts to `byte` before testing (`while ((byte) in.read() != -1)`) would stop early on any
`0xFF` byte in a binary file.

For text, `BufferedReader.readLine()` returns the next line **without** its terminator (`\n`, `\r` or
`\r\n`), and `null` — not an empty string — at the end of the stream. An empty line is `""`.

```java predict
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        var reader = new BufferedReader(new StringReader("alpha\n\nbeta\r\ngamma"));
        String line;
        int n = 0;
        while ((line = reader.readLine()) != null) {
            System.out.println(++n + ":[" + line + "]");
        }
        System.out.println(reader.read());
    }
}
```
```output
1:[alpha]
2:[]
3:[beta]
4:[gamma]
-1
```

> [!TRAP]
> `readLine()` returns `null`, `read()` returns `-1`. A loop written `while (line != "")` or
> `while (reader.read() != null)` is a bug or a compile error (`int` cannot be compared with `null`).
> The last line counts even without a trailing newline.

::check D9-IO-001

## Writing: overwrite vs append, write(int), flush and close

`FileOutputStream` and `FileWriter` **create** the file if it does not exist and **truncate** it if it does
— unless you pass `true` as the *append* flag. `OutputStream.write(int b)` writes only the **low-order 8
bits** of `b` (`write(300)` writes the byte `44`); `Writer.write(int c)` writes the low 16 bits as a char.

```java predict
import java.io.*;
import java.nio.file.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Path dir = Files.createTempDirectory("io");
        File f = dir.resolve("log.txt").toFile();
        try (var w = new FileWriter(f))        { w.write("one;"); }
        try (var w = new FileWriter(f, true))  { w.write("two;"); }
        try (var w = new FileWriter(f, true))  { w.write("three;"); }
        System.out.println(Files.readString(f.toPath()));
        try (var w = new FileWriter(f))        { w.write("reset"); }
        System.out.println(Files.readString(f.toPath()));
    }
}
```
```output
one;two;three;
reset
```

**Buffering.** `BufferedWriter`, `BufferedOutputStream`, and the writer inside `PrintWriter` keep data in a
memory buffer and only push it to the underlying stream when the buffer fills, when you call `flush()`, or
when you call `close()` (which flushes first). Forgetting to close or flush is the classic "my file is
empty" bug:

```java predict
import java.io.*;

public class Main {
    public static void main(String[] args) {
        var bytes = new ByteArrayOutputStream();
        var out = new PrintWriter(bytes);          // no autoflush
        out.print("hello");
        System.out.println("before flush: " + bytes.size());
        out.flush();
        System.out.println("after flush: " + bytes.size());
        out.println(" world");
        out.close();                                // flushes, then closes
        System.out.println("after close: " + bytes.size());
        out.println("ignored");                     // no exception!
        System.out.println(out.checkError());
    }
}
```
```output
before flush: 0
after flush: 5
after close: 12
true
```

Writing to a closed `PrintWriter` throws nothing — it just sets the error flag that `checkError()` reports.
(`" world"` + line separator is 7 bytes on Linux; the line separator is platform dependent.)

::check D9-IO-004

## Bridges and charsets

A character becomes one or more bytes depending on the charset. Always name it: the no-charset
constructors use the platform default, which since **Java 18 (JEP 400) is UTF-8** on every platform
(override with `-Dfile.encoding`).

```java predict
import java.io.*;
import java.nio.charset.StandardCharsets;

public class Main {
    public static void main(String[] args) throws IOException {
        String word = "naïve";
        var utf8 = new ByteArrayOutputStream();
        try (Writer w = new OutputStreamWriter(utf8, StandardCharsets.UTF_8)) { w.write(word); }
        var latin1 = new ByteArrayOutputStream();
        try (Writer w = new OutputStreamWriter(latin1, StandardCharsets.ISO_8859_1)) { w.write(word); }
        System.out.println(word.length() + " " + utf8.size() + " " + latin1.size());

        var back = new InputStreamReader(new ByteArrayInputStream(utf8.toByteArray()), StandardCharsets.ISO_8859_1);
        int c, count = 0;
        while ((c = back.read()) != -1) count++;
        System.out.println(count);
    }
}
```
```output
5 6 5
6
```

`ï` takes two bytes in UTF-8 and one in ISO-8859-1. Decoding the UTF-8 bytes with the *wrong* charset
yields six characters ("mojibake") — no exception is thrown.

## PrintStream vs PrintWriter

Both add `print`, `println`, `printf`/`format` and convert any value to text. Their differences are
exam favourites:

| | `PrintStream` | `PrintWriter` |
|---|---|---|
| Family | `OutputStream` subclass | `Writer` subclass |
| Typical instance | `System.out`, `System.err` | your own text files and sockets |
| Constructors accept | `OutputStream`, `File`, file name | `Writer`, `OutputStream`, `File`, file name |
| Autoflush (flag `true`) | on `println`, on writing a byte array, and whenever a `'\n'` is written | only on `println`, `printf`, `format` |
| `write(int)` writes | a **byte** | a **char** |
| Throws `IOException` from print methods? | **never** — use `checkError()` | **never** — use `checkError()` |

The constructors that take a *file name* or `File` do declare `FileNotFoundException`, because opening
the file can fail. After that, failures are silent.

> [!TRAP]
> "autoflush" does not mean "flush after every call". `new PrintWriter(out, true).print("x")` leaves
> `"x"` in the buffer; only the next `println`/`printf`/`format` (or `flush()`/`close()`) pushes it.

## Closing wrapped streams and try-with-resources order

Each decorator's `close()` flushes (if it writes) and then closes the stream it wraps. So closing the
**outermost** object is enough. If you declare each layer as its own resource, try-with-resources closes them
in **reverse declaration order** — the outer one first — and closing an already-closed stream is a no-op
for the standard classes.

```java predict
import java.io.*;

public class Main {
    static class Tracked extends FilterOutputStream {
        private final String name;
        Tracked(String name, OutputStream out) { super(out); this.name = name; }
        @Override public void flush() throws IOException { System.out.print("flush-" + name + " "); super.flush(); }
        @Override public void close() throws IOException { System.out.print("close-" + name + " "); super.close(); }
    }
    public static void main(String[] args) throws IOException {
        try (var inner = new Tracked("inner", new ByteArrayOutputStream());
             var outer = new Tracked("outer", inner)) {
            outer.write('x');
        }
    }
}
```
```output
close-outer flush-outer flush-inner close-inner flush-inner close-inner
```

Trace it: try-with-resources closes `outer` first (`close-outer`). `FilterOutputStream.close()` then
flushes (`flush-outer`, which delegates to `inner.flush()` → `flush-inner`) and closes the wrapped stream
(`close-inner`, which in turn flushes and closes the `ByteArrayOutputStream`). Finally try-with-resources
closes `inner` *again*, as declared: our override prints `close-inner`, but `FilterOutputStream.close()`
remembers it is already closed and returns immediately — no second flush.

> [!REAL]
> In production code, declare only the outermost stream (`try (var w = new BufferedWriter(new FileWriter(f)))`)
> or each layer as above — both close everything. What you must never do is close the *inner* stream and
> keep using the outer one.

::check D9-IO-002

## mark, reset and skip

Some streams can remember a position: `mark(readAheadLimit)` sets it, `reset()` goes back to it, and
`markSupported()` tells you whether the stream can do it. `BufferedReader`, `BufferedInputStream`,
`ByteArrayInputStream`, `StringReader` and `CharArrayReader` support it; `FileInputStream`, `FileReader`
and `InputStreamReader` do not (their `reset()` throws `IOException`) — which is one more reason to wrap
them in a buffered stream. `skip(n)` discards up to `n` units and returns the number actually skipped
(0 at the end).

```java predict
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        try (var r = new BufferedReader(new StringReader("ABCDEFG"))) {
            System.out.print((char) r.read());
            r.mark(10);
            System.out.print((char) r.read());
            System.out.print((char) r.read());
            r.reset();
            System.out.print((char) r.read());
            System.out.print(r.skip(3));
            System.out.print((char) r.read());
            System.out.println(" " + r.skip(5) + " " + r.read());
        }
    }
}
```
```output
ABCB3F 1 -1
```

After `A` the mark sits before `B`; `reset()` rewinds there, so `B` is read twice. `skip(3)` jumps over
`CDE`; only `G` remains, so `skip(5)` returns `1`.

## Console input: System.in, Scanner, BufferedReader, Console and IO

`System.in` is a raw `InputStream`. You usually wrap it:

```java
var scanner = new Scanner(System.in);                         // tokens and lines, parses numbers
var reader  = new BufferedReader(new InputStreamReader(System.in));   // lines, fast
```

`System.console()` returns a `java.io.Console` **or `null`** when the JVM is not attached to an interactive
terminal — input or output redirected, an IDE run configuration, a CI job, or this course's code runner.
`Console` offers `readLine(fmt, args…)`, `readPassword()` (returns `char[]`, no echo), `printf`/`format`,
`reader()` and `writer()`. Always null-check it:

```java predict
import java.io.Console;

public class Main {
    public static void main(String[] args) {
        Console console = System.console();
        if (console == null) {
            System.out.println("no console attached");
            return;
        }
        String name = console.readLine("Name? ");
        console.printf("Hi %s%n", name);
    }
}
```
```output
no console attached
```

> [!NOTE]
> Since Java 22 `Console` also has `isTerminal()`, and Java 23 added `Console.format(Locale, …)`,
> `printf(Locale, …)`, `readLine(Locale, …)` and `readPassword(Locale, …)` overloads so prompts can be
> formatted for a specific locale (localization lesson).

A classic `Scanner` trap: `nextInt()` reads the token but **not** the line terminator after it, so the
next `nextLine()` returns the rest of that line — an empty string.

> [!J25]
> **`java.lang.IO` is final in Java 25 (JEP 512)**, alongside compact source files and instance `main`
> methods. It is a utility class in `java.lang` (no import needed) with static `IO.println(Object)`,
> `IO.println()`, `IO.print(Object)`, `IO.readln()` and `IO.readln(String prompt)`. In Java 25 it is built
> on `System.out` and `System.in`, so it works even when `System.console()` is null.
> **Java 24** also added `Reader.of(CharSequence)`, a lightweight `Reader` over any `CharSequence`
> (similar to `new StringReader(s)`, but not meant to be shared between threads).

```java predict
public class Main {
    public static void main(String[] args) throws Exception {
        IO.println("io " + 25);
        try (var r = java.io.Reader.of(new StringBuilder("xyz"))) {
            IO.println((char) r.read() + " " + r.markSupported());
        }
    }
}
```
```output
io 25
x true
```

## What if…? One change at a time

| Change | Result |
|---|---|
| `new FileWriter(f)` → `new FileWriter(f, true)` | existing content is kept; new text is appended |
| `new BufferedReader(new FileInputStream(f))` | does not compile — needs a `Reader`; insert an `InputStreamReader` |
| Remove `close()`/`flush()` after `bufferedWriter.write(...)` | the file may stay empty: the data never left the buffer |
| `out.print("x")` on `new PrintWriter(os, true)` | nothing reaches `os` yet — autoflush only on `println`/`printf`/`format` |
| `reset()` on a `FileInputStream` | `IOException: mark/reset not supported` |
| `reader.readLine()` after the last line | returns `null`; `read()` returns `-1` |
| `System.console().readLine()` without a terminal | `NullPointerException` — `console()` returned `null` |
| Write `"é"` with `OutputStreamWriter(..., UTF_8)` | 2 bytes; with `ISO_8859_1`, 1 byte |

## Exam traps checklist

> [!TRAP]
> - `InputStream.read()` returns `int`; byte `0xFF` comes back as `255`, never `-1`. `read(byte[])` returns a **count**.
> - `readLine()` strips the terminator and returns `null` at the end — not `""` and not `-1`.
> - `FileWriter`/`FileOutputStream` **overwrite** by default; `true` as the 2nd argument appends.
> - `PrintWriter`/`PrintStream` print methods never throw `IOException` — `checkError()` reveals failures.
> - `Reader`/`Writer` decorators cannot wrap byte streams (and vice versa) — except `PrintWriter(OutputStream)` and the two bridges.
> - try-with-resources closes in reverse order; closing a wrapper closes what it wraps.
> - `System.console()` may be `null`; `Console.readPassword()` returns `char[]`, not `String`.
> - `Scanner.nextInt()` followed by `nextLine()` returns the empty remainder of the current line.
