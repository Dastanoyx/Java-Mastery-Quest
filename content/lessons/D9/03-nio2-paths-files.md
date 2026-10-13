---
id: io-nio2
domain: D9
order: 3
title: NIO.2 — Path Manipulation and the Files API
summary: Build and dissect Path objects (names, root, parent, subpath), normalize, resolve and relativize them without touching the disk, then create, copy, move, delete, read, write, list, walk and search real files with java.nio.file.Files — including every exception the exam expects you to predict.
minutes: 60
objectives: [D9.3]
prerequisites: [io-streams]
contract:
  - Predict the result of getFileName, getParent, getRoot, getNameCount, getName, subpath, normalize, resolve, relativize and toAbsolutePath on absolute and relative paths.
  - Distinguish purely syntactic Path operations from those that access the file system (toRealPath, isSameFile, Files.*).
  - Predict which Files operation succeeds and which throws FileAlreadyExistsException, NoSuchFileException or DirectoryNotEmptyException, with and without StandardCopyOption.
  - Read and write files with readAllLines, readString, writeString, lines, newBufferedReader/Writer — closing streams that need it.
  - Traverse directories with list, walk and find, including what depth 0 means and why results must be sorted for deterministic output.
keyRules:
  - "Path.of(...) (Java 11) and Paths.get(...) are equivalent factories; a Path is immutable and need not exist."
  - "Name elements exclude the root: for /a/b/c, getNameCount() is 3, getName(0) is a, getRoot() is /; a relative path has a null root."
  - "subpath(begin, end) is zero-based, end-exclusive, never includes the root, and throws IllegalArgumentException for invalid indices."
  - "normalize() removes . and resolves name/.. pairs purely syntactically; leading .. of a relative path is kept."
  - "p.resolve(q) returns q if q is absolute; if q is empty it returns p; otherwise it appends q to p."
  - "p.relativize(q) requires both paths to be absolute or both relative, otherwise IllegalArgumentException."
  - "toRealPath() resolves symbolic links and requires the file to exist (NoSuchFileException); toAbsolutePath() does not check existence."
  - "createDirectory fails if the parent is missing (NoSuchFileException) or the target exists (FileAlreadyExistsException); createDirectories creates all missing parents and tolerates an existing directory."
  - "copy and move throw FileAlreadyExistsException if the target exists, unless StandardCopyOption.REPLACE_EXISTING is given."
  - "delete throws NoSuchFileException if missing and DirectoryNotEmptyException for a non-empty directory; deleteIfExists returns false if missing."
  - "Files.lines, list, walk and find return lazily-populated streams holding open file handles — close them (try-with-resources)."
  - "walk(start, maxDepth) includes start itself at depth 0; walk does not follow symbolic links by default."
retrieval:
  - For /data/app/../logs/./today.log write getNameCount(), getName(1), getFileName(), getParent() and normalize().
  - State the two rules that make resolve and relativize throw or return something surprising.
  - List four Files methods that throw an exception when the target already exists and one way to avoid each.
  - Explain why a predict-output program using Files.list must sort its results.
checks: [D9-NIO-001, D9-NIO-002, D9-NIO-003, D9-NIO-004]
mastery: [D9-NIO-005, D9-NIO-006, D9-NIO-007, D9-NIO-008, D9-NIO-009, D9-NIO-010, D9-NIO-011]
---

## Mental model: a Path is an address, Files is the post office

`java.nio.file` (NIO.2, Java 7) splits file handling into two very different responsibilities:

- **`Path`** is an immutable *address*: a root (maybe), and a sequence of **name elements** separated by the
  platform separator. Creating or manipulating a `Path` is pure string-like computation — the file does not
  need to exist, and nothing on disk is touched.
- **`Files`** is a utility class of static methods that actually **go to the file system**: create, copy,
  move, delete, read, write, list and inspect. These are the methods that throw `IOException`s.

```java
Path p1 = Path.of("/home/ana/notes.txt");           // Java 11+
Path p2 = Paths.get("/home", "ana", "notes.txt");  // older factory — same result
Path p3 = Path.of("reports", "2025", "q1.csv");    // relative: reports/2025/q1.csv
Path p4 = FileSystems.getDefault().getPath("x");   // what both factories delegate to
File legacy = p1.toFile();  Path back = legacy.toPath();   // bridge to java.io.File
```

> [!RULE]
> `Path` is an **interface**; you never call `new Path(...)`. Its methods return **new** `Path` objects —
> `p.normalize()` on its own line changes nothing, exactly like `s.toUpperCase()` on a `String`.

All examples use Unix-style paths, as the exam does. On Windows the root would be `C:\` and the separator
`\`, but the rules are the same.

## Anatomy of a path: names, root, parent, subpath

For `/home/ana/docs/report.txt`, the **root** is `/` and the **name elements** are `home`, `ana`, `docs`,
`report.txt` — indexed from 0, **excluding** the root.

```java predict
import java.nio.file.*;

public class Main {
    public static void main(String[] args) {
        Path abs = Path.of("/home/ana/docs/report.txt");
        System.out.println(abs.getNameCount() + " " + abs.getName(0) + " " + abs.getFileName());
        System.out.println(abs.getParent() + " | " + abs.getRoot() + " | " + abs.subpath(1, 3));
        System.out.println(abs.isAbsolute() + " " + abs.getParent().getParent().getFileName());

        Path rel = Path.of("docs/report.txt");
        System.out.println(rel.getRoot() + " " + rel.getParent() + " " + rel.getParent().getParent());
        Path root = Path.of("/");
        System.out.println(root.getNameCount() + " " + root.getFileName() + " " + root.getParent());
        System.out.println(abs.startsWith("/home") + " " + abs.endsWith("report.txt") + " " + abs.endsWith("t.txt"));
    }
}
```
```output
4 home report.txt
/home/ana/docs | / | ana/docs
true ana
null docs null
0 null null
true true false
```

- `getFileName()` is the **last name element** (file or directory), `getParent()` everything before it,
  `getRoot()` the root or `null` for a relative path.
- `subpath(1, 3)` is zero-based and end-exclusive, and its result is always **relative** (no root).
  Out-of-range indices (e.g. `subpath(2, 2)` or `subpath(0, 5)` here) throw `IllegalArgumentException`.
- `startsWith`/`endsWith` compare **whole name elements**, not characters: `"t.txt"` is not a suffix.

> [!TRAP]
> `getName(0)` of `/home/ana` is `home`, not `/`. And the root path `/` has **zero** names, so
> `Path.of("/").getName(0)` throws `IllegalArgumentException`.

## normalize, resolve, relativize — still no disk access

**`normalize()`** removes redundant `.` elements and cancels each `name/..` pair. It is purely syntactic:
it does not check that the names exist and does not follow links. A `..` with nothing before it stays in a
relative path (and disappears at the root of an absolute one).

**`resolve(other)`** joins paths: `base.resolve("x/y")` → `base/x/y`. If `other` is **absolute**, it is
returned unchanged — the base is ignored. `resolveSibling(other)` resolves against the parent.

**`relativize(other)`** answers "how do I get from this path to `other`?" — the inverse of `resolve`.
Both paths must be of the same kind (both absolute or both relative); otherwise `IllegalArgumentException`.

```java predict
import java.nio.file.*;

public class Main {
    public static void main(String[] args) {
        Path base = Path.of("/srv/app");
        System.out.println(base.resolve("logs/./today.log"));
        System.out.println(base.resolve("/etc/hosts"));
        System.out.println(base.resolve("../shared").normalize());
        System.out.println(base.resolveSibling("web"));

        System.out.println(Path.of("a/./b/../c/").normalize());
        System.out.println(Path.of("../../x/y/..").normalize());
        System.out.println(Path.of("/../x").normalize());

        Path from = Path.of("/srv/app/logs");
        Path to = Path.of("/srv/data/in.csv");
        System.out.println(from.relativize(to));
        System.out.println(from.resolve(from.relativize(to)).normalize());
        System.out.println(Path.of("a/b").relativize(Path.of("a/b/c/d")));
    }
}
```
```output
/srv/app/logs/./today.log
/etc/hosts
/srv/shared
/srv/web
a/c
../../x
/x
../../data/in.csv
/srv/data/in.csv
c/d
```

Note that `resolve` does **not** normalize — `./` survives until you call `normalize()`.

> [!TRAP]
> `Path.of("/srv").relativize(Path.of("logs"))` throws `IllegalArgumentException: 'other' is different type
> of Path`. And `base.resolve("/etc/hosts")` silently discards `base` — a classic source of path-traversal
> bugs when `other` comes from user input.

::check D9-NIO-001

::check D9-NIO-002

**Absolute and real paths.** `toAbsolutePath()` prefixes a relative path with the current working directory
— without checking existence. `toRealPath()` returns the absolute, normalized path with symbolic links
resolved, and therefore **requires the file to exist** (`NoSuchFileException` otherwise).
`Files.isSameFile(p, q)` returns `true` immediately if the two paths are `equals`, and otherwise asks the
file system (which then requires both to exist).

## Creating, copying, moving and deleting

| Method | Succeeds when | Throws |
|---|---|---|
| `createFile(p)` | `p` does not exist, parent exists | `FileAlreadyExistsException`, `NoSuchFileException` (parent missing) |
| `createDirectory(p)` | same, for a directory | same |
| `createDirectories(p)` | always creates missing parents; OK if `p` is already a directory | `FileAlreadyExistsException` only if `p` exists as a **file** |
| `createTempFile` / `createTempDirectory` | always (unique name) | — |
| `copy(src, dst, opts…)` | `dst` does not exist, or `REPLACE_EXISTING` | `FileAlreadyExistsException`, `NoSuchFileException` (src missing) |
| `move(src, dst, opts…)` | same; `ATOMIC_MOVE` asks for an atomic rename | same |
| `delete(p)` | `p` exists and (if a directory) is empty | `NoSuchFileException`, `DirectoryNotEmptyException` |
| `deleteIfExists(p)` | always returns `true`/`false` | `DirectoryNotEmptyException` |

Options come from `StandardCopyOption` (`REPLACE_EXISTING`, `COPY_ATTRIBUTES`, `ATOMIC_MOVE`) and
`LinkOption.NOFOLLOW_LINKS`. Copying a directory copies **only the directory entry**, not its contents.
`move` can also rename. The exceptions are all subclasses of `FileSystemException` → `IOException`.

```java predict
import java.io.IOException;
import java.nio.file.*;

public class Main {
    static void attempt(String label, Callable task) {
        try { task.run(); System.out.println(label + ": ok"); }
        catch (IOException e) { System.out.println(label + ": " + e.getClass().getSimpleName()); }
    }
    interface Callable { void run() throws IOException; }

    public static void main(String[] args) throws IOException {
        Path dir = Files.createTempDirectory("nio");
        Path a = dir.resolve("a.txt"), b = dir.resolve("b.txt"), sub = dir.resolve("sub/deeper");
        attempt("createFile a", () -> Files.createFile(a));
        attempt("createFile a again", () -> Files.createFile(a));
        attempt("createDirectory sub/deeper", () -> Files.createDirectory(sub));
        attempt("createDirectories sub/deeper", () -> Files.createDirectories(sub));
        attempt("createDirectories again", () -> Files.createDirectories(sub));
        attempt("copy a->b", () -> Files.copy(a, b));
        attempt("copy a->b again", () -> Files.copy(a, b));
        attempt("copy REPLACE_EXISTING", () -> Files.copy(a, b, StandardCopyOption.REPLACE_EXISTING));
        attempt("move b->sub/deeper/b.txt", () -> Files.move(b, sub.resolve("b.txt")));
        attempt("delete sub", () -> Files.delete(dir.resolve("sub")));
        attempt("delete b", () -> Files.delete(b));
        System.out.println(Files.deleteIfExists(b) + " " + Files.exists(sub.resolve("b.txt")));
    }
}
```
```output
createFile a: ok
createFile a again: FileAlreadyExistsException
createDirectory sub/deeper: NoSuchFileException
createDirectories sub/deeper: ok
createDirectories again: ok
copy a->b: ok
copy a->b again: FileAlreadyExistsException
copy REPLACE_EXISTING: ok
move b->sub/deeper/b.txt: ok
delete sub: DirectoryNotEmptyException
delete b: NoSuchFileException
false true
```

::check D9-NIO-003

## Reading and writing files

| Method | Returns / does | Notes |
|---|---|---|
| `readAllLines(p)` | `List<String>` | whole file in memory, UTF-8 by default |
| `readString(p)` (11) | `String` | whole file |
| `lines(p)` | `Stream<String>` | lazy; **must be closed** |
| `writeString(p, cs, opts…)` (11) | writes text | default options: `CREATE`, `TRUNCATE_EXISTING`, `WRITE` |
| `write(p, Iterable<String>, opts…)` | writes lines, each followed by the line separator | same defaults |
| `newBufferedReader(p)` / `newBufferedWriter(p, opts…)` | `BufferedReader` / `BufferedWriter` | UTF-8 by default (unlike the old `FileReader` before Java 18) |
| `readAllBytes(p)` / `write(p, byte[])` | bytes | |

`StandardOpenOption.APPEND` appends instead of truncating; `CREATE_NEW` fails if the file exists. All `Files`
read/write methods default to **UTF-8**.

```java predict
import java.io.IOException;
import java.nio.file.*;
import java.util.List;
import java.util.stream.Stream;

public class Main {
    public static void main(String[] args) throws IOException {
        Path f = Files.createTempDirectory("rw").resolve("todo.txt");
        Files.writeString(f, "buy milk\n");
        Files.writeString(f, "call bank\n", StandardOpenOption.APPEND);
        Files.write(f, List.of("fix bike", "read book"), StandardOpenOption.APPEND);
        List<String> all = Files.readAllLines(f);
        System.out.println(all.size() + " " + all.get(2));
        try (Stream<String> lines = Files.lines(f)) {
            System.out.println(lines.filter(s -> s.contains("b")).count());
        }
        try (var w = Files.newBufferedWriter(f)) {      // default: truncate
            w.write("fresh");
            w.newLine();
        }
        System.out.println(Files.readString(f).strip() + " " + Files.size(f));
    }
}
```
```output
4 fix bike
4
fresh 6
```

> [!TRAP]
> `Files.lines`, `Files.list`, `Files.walk` and `Files.find` keep a file handle or directory stream open
> until the `Stream` is **closed**. A terminal operation does *not* close it. Always use
> try-with-resources. `readAllLines` and `readString` load everything at once — no closing needed, but
> beware of huge files.

## Listing, walking and searching directories

- `Files.list(dir)` — the **direct** children of `dir` (not recursive).
- `Files.walk(start)` / `walk(start, maxDepth)` — depth-first traversal, **including `start` itself at depth
  0**. `maxDepth 1` = start + its children. Symbolic links are not followed unless you pass
  `FileVisitOption.FOLLOW_LINKS`.
- `Files.find(start, maxDepth, BiPredicate<Path, BasicFileAttributes>)` — like `walk`, but filters with
  access to the file attributes (no extra I/O). Note that `maxDepth` is **mandatory** here.

The order in which a directory's entries are returned is file-system dependent, so **sort** whenever output
must be deterministic:

```java predict
import java.io.IOException;
import java.nio.file.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Path root = Files.createTempDirectory("tree");
        Files.createDirectories(root.resolve("src/main"));
        Files.writeString(root.resolve("README.md"), "# demo");
        Files.writeString(root.resolve("src/App.java"), "class App {}");
        Files.writeString(root.resolve("src/main/Util.java"), "class Util {}");

        try (Stream<Path> s = Files.list(root)) {
            System.out.println(s.map(p -> root.relativize(p).toString()).sorted().toList());
        }
        try (Stream<Path> s = Files.walk(root, 1)) {
            System.out.println(s.count());
        }
        try (Stream<Path> s = Files.walk(root)) {
            System.out.println(s.map(p -> root.relativize(p).toString()).sorted().toList());
        }
        try (Stream<Path> s = Files.find(root, 10,
                (p, attrs) -> attrs.isRegularFile() && p.toString().endsWith(".java"))) {
            System.out.println(s.map(p -> p.getFileName().toString()).sorted().collect(Collectors.joining(",")));
        }
    }
}
```
```output
[README.md, src]
3
[, README.md, src, src/App.java, src/main, src/main/Util.java]
App.java,Util.java
```

`walk(root, 1)` returns **3** paths: `root` itself plus its two children. In the full walk, `root`
relativized against itself is the **empty path** `""`.

::check D9-NIO-004

> [!J25]
> The NIO.2 API itself did not change in Java 22–25, but **compact source files and instance `main`
> methods are final in Java 25 (JEP 512)**, which makes small file utilities very short. A file
> `Count.java` containing only the lines below runs with `java Count.java` and needs **no imports**: a
> compact source file implicitly imports `module java.base`, which includes `java.nio.file`, and `IO` lives
> in `java.lang`:
>
> ```java
> void main() throws Exception {
>     try (var lines = Files.lines(Path.of("app.log"))) {
>         IO.println(lines.filter(l -> l.contains("ERROR")).count());
>     }
> }
> ```

## Attributes, isSameFile and mismatch

Single checks: `Files.exists`, `notExists` (both can be `false` if access is denied), `isDirectory`,
`isRegularFile`, `isSymbolicLink`, `isReadable`, `isWritable`, `isExecutable`, `isHidden`, `size`,
`getLastModifiedTime`. For several attributes at once, read them in **one** file-system call:

```java predict
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;

public class Main {
    public static void main(String[] args) throws IOException {
        Path dir = Files.createTempDirectory("attrs");
        Path one = Files.writeString(dir.resolve("one.txt"), "abcdef");
        Path two = Files.writeString(dir.resolve("two.txt"), "abcXef");
        Path copy = Files.copy(one, dir.resolve("copy.txt"));

        BasicFileAttributes a = Files.readAttributes(one, BasicFileAttributes.class);
        System.out.println(a.isRegularFile() + " " + a.isDirectory() + " " + a.size());
        System.out.println(Files.mismatch(one, two) + " " + Files.mismatch(one, copy));
        System.out.println(Files.isSameFile(one, copy) + " "
            + Files.isSameFile(one, dir.resolve("sub/../one.txt").normalize()));
        System.out.println(Files.isSameFile(Path.of("ghost.txt"), Path.of("ghost.txt")));
    }
}
```
```output
true false 6
3 -1
false true
true
```

- `Files.mismatch(a, b)` (Java 12) returns the index of the **first differing byte**, or **-1** if the
  contents are identical (if one file is a prefix of the other, the shorter file's size).
- `isSameFile` asks "do these paths locate the same file?", not "same content": a copy is a different
  file. Two `equals` paths return `true` **without** any disk access — even if the file does not exist.
- Write access to attributes goes through `Files.getFileAttributeView(p, BasicFileAttributeView.class)` and
  `setTimes(...)`, or `Files.setLastModifiedTime`.

## What if…? One change at a time

| Change | Result |
|---|---|
| `p.normalize();` as a statement | nothing — paths are immutable; use the return value |
| `resolve` an absolute path | the argument is returned; the base is ignored |
| `relativize` absolute with relative | `IllegalArgumentException` |
| `subpath(0, getNameCount() + 1)` | `IllegalArgumentException` |
| `toRealPath()` on a missing file | `NoSuchFileException`; `toAbsolutePath()` would succeed |
| `createDirectory("a/b")` when `a` is missing | `NoSuchFileException` — use `createDirectories` |
| `copy`/`move` onto an existing file without options | `FileAlreadyExistsException` |
| `delete` a non-empty directory | `DirectoryNotEmptyException` (also for `deleteIfExists`) |
| `Files.walk(dir, 0)` | a stream with exactly one element: `dir` |
| Forgetting to close `Files.lines(...)` | works, but leaks a file handle |

## Exam traps checklist

> [!TRAP]
> - Name indices exclude the root; `getNameCount()` of `/` is 0; a relative path's `getRoot()` is `null`.
> - `subpath` and `getName` throw `IllegalArgumentException`, not `IndexOutOfBoundsException`.
> - `normalize`, `resolve`, `relativize`, `toAbsolutePath` never check existence; `toRealPath` does.
> - `Files.walk` includes the starting directory; `Files.find` requires `maxDepth`.
> - `Files.delete` vs `deleteIfExists`: missing file ⇒ exception vs `false`; non-empty directory ⇒ exception for both.
> - `Files.mismatch` returns -1 for identical files; `isSameFile` is about identity, not content.
> - Stream-returning `Files` methods must be closed.

## Practice

::exercise D9-EX-001
