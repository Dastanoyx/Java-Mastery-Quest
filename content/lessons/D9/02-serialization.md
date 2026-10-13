---
id: io-serialization
domain: D9
order: 2
title: Serialization — Turning Objects into Bytes and Back
summary: How ObjectOutputStream and ObjectInputStream serialize object graphs, what transient and static fields become, which constructors run on deserialization, serialVersionUID, the exceptions you will meet, records, custom writeObject/readObject hooks, and Externalizable.
minutes: 45
objectives: [D9.2]
prerequisites: [io-streams, oop-constructors]
contract:
  - Decide whether an object graph can be serialized, and predict NotSerializableException or InvalidClassException and when each is thrown.
  - Predict every field value of a deserialized object — serialized, transient, static and inherited from a non-serializable superclass.
  - State exactly which constructors and initializers run during deserialization of a class and of a record.
  - Use serialVersionUID correctly and explain what happens when it does not match.
  - Customise serialization with private writeObject/readObject methods, and contrast Serializable with Externalizable.
keyRules:
  - "A class is serializable if it (or a superclass) implements the marker interface java.io.Serializable; every non-transient, non-static field must then hold a serializable value (or null)."
  - "writeObject throws NotSerializableException (a subclass of ObjectStreamException → IOException) when it meets an object whose class is not serializable."
  - "transient and static fields are not written. After deserialization, a transient field has its type's default value; a static field shows whatever the class currently holds."
  - "Deserialization does NOT run the constructors, field initializers or instance initializer blocks of serializable classes. It runs the no-arg constructor of the first NON-serializable superclass (and that class's initializers)."
  - "If the first non-serializable superclass has no accessible no-arg constructor, readObject throws InvalidClassException (no valid constructor) — writing still succeeded."
  - "Records are deserialized by calling their canonical constructor with the stream values, so compact-constructor validation runs."
  - "serialVersionUID is a private static final long; if it is missing, one is computed from the class structure, so recompiling a changed class can break old streams with InvalidClassException."
  - "Within one stream, an object written twice is stored once and read back as the same reference; later changes to it are not written again."
retrieval:
  - List what each kind of field (normal, transient, static, inherited from a non-serializable parent) contains after deserialization.
  - Explain which constructor runs when a Serializable class extends a non-serializable class, and what happens if that parent has no no-arg constructor.
  - Write the exact signatures of the private writeObject and readObject hook methods.
checks: [D9-SER-001, D9-SER-002, D9-SER-003]
mastery: [D9-SER-004, D9-SER-005, D9-SER-006, D9-SER-007, D9-SER-008, D9-SER-009]
---

## Mental model: a snapshot of an object graph

**Serialization** converts an object — and everything it references — into a byte stream;
**deserialization** rebuilds an equivalent graph from those bytes, possibly in another JVM. Java's built-in
mechanism lives in two decorator streams:

```java
try (var out = new ObjectOutputStream(new FileOutputStream("game.ser"))) {
    out.writeObject(player);                 // writes player + everything reachable from it
}
try (var in = new ObjectInputStream(new FileInputStream("game.ser"))) {
    Player p = (Player) in.readObject();     // returns Object; throws IOException, ClassNotFoundException
}
```

Think of it as a camera taking a picture of the **instance state**: it walks the fields of the object, and
of each object those fields point to, recording each object once. It does not record code, static state
or anything the class marks as `transient`. On the way back it must *create* objects without the normal
`new`, which is why the constructor rules below are surprising.

> [!RULE]
> `readObject()` declares `IOException` **and** `ClassNotFoundException` (both checked) and returns
> `Object` — a cast is needed. At end of file it throws `EOFException`; it never returns a sentinel such
> as `null` or `-1` (although a `null` that was written is read back as `null`).

## What gets written: Serializable, transient, static

`java.io.Serializable` is a **marker interface** — it has no methods. A class is serializable if it or any
superclass implements it. When `writeObject` serializes an object it writes, for every serializable class
in its hierarchy, all fields that are **neither `static` nor `transient`**. Each written field value must
itself be serializable (primitives, `String`, arrays of serializable values, most collections, records and
enums that implement `Serializable`…), or `null`.

```java predict
import java.io.*;

class Player implements Serializable {
    private static final long serialVersionUID = 1L;
    String name;
    transient int sessionScore;
    transient String token = "tok";
    static int online = 0;
    Player(String name, int score) { this.name = name; this.sessionScore = score; online++; }
}

public class Main {
    static Object roundTrip(Object o) throws IOException, ClassNotFoundException {
        var bytes = new ByteArrayOutputStream();
        try (var out = new ObjectOutputStream(bytes)) { out.writeObject(o); }
        try (var in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            return in.readObject();
        }
    }
    public static void main(String[] args) throws Exception {
        Player p = new Player("Lina", 42);
        Player.online = 7;                 // static state changes after writing
        Player copy = (Player) roundTrip(p);
        System.out.println(copy.name + " " + copy.sessionScore + " " + copy.token + " " + Player.online);
        System.out.println((copy == p) + " " + copy.name.equals(p.name));
    }
}
```
```output
Lina 0 null 7
false true
```

- `name` was written and restored.
- `sessionScore` and `token` are `transient`: they come back with their **default values** (`0`, `null`).
  The initializer `= "tok"` does *not* run again (see the next section).
- `online` is `static`: it belongs to the class, not the object, so you see whatever the class holds now.
- The result is a **new** object (`copy != p`) with equal state.

::check D9-SER-001

If any reachable object is not serializable, `writeObject` throws `java.io.NotSerializableException`
whose message is the offending class name — at **write** time, possibly after part of the stream has
already been written. Mark the field `transient` (or make its class serializable) to fix it.

::check D9-SER-003

## Which constructors run on deserialization?

This is the most tested rule of the topic. To rebuild an object, deserialization:

1. Finds the **first superclass that is NOT serializable** (at worst, `Object`).
2. Runs **that class's no-arg constructor** (and therefore its field initializers, instance blocks, and its
   own superclasses' constructors).
3. For each serializable class below it, **restores the field values from the stream — without running
   any of their constructors, field initializers or instance initializer blocks.**

```java predict
import java.io.*;

class Animal {                                   // NOT serializable
    String kind = "unknown";
    Animal() { System.out.println("Animal()"); kind = "animal"; }
}
class Dog extends Animal implements Serializable {
    String name = "Rex";
    int age;
    { System.out.println("Dog init block"); }
    Dog(String name, int age) { System.out.println("Dog(...)"); this.name = name; this.age = age; kind = "dog"; }
}

public class Main {
    public static void main(String[] args) throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (var out = new ObjectOutputStream(bytes)) { out.writeObject(new Dog("Fido", 3)); }
        System.out.println("--- reading");
        try (var in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            Dog d = (Dog) in.readObject();
            System.out.println(d.kind + " " + d.name + " " + d.age);
        }
    }
}
```
```output
Animal()
Dog init block
Dog(...)
--- reading
Animal()
animal Fido 3
```

On reading, `Animal()` runs because `Animal` is the first non-serializable superclass, so `kind` is
reset to `"animal"` — the value `"dog"` was **never written**, because fields of a non-serializable class
are not part of the stream. `Dog`'s initializer block and constructor do not run; `name` and `age` come
from the stream.

> [!TRAP]
> If `Animal` had only `Animal(String kind)` and no no-arg constructor, **writing would still succeed** —
> the failure comes at **read** time: `java.io.InvalidClassException: Dog; no valid constructor`.

::check D9-SER-002

## serialVersionUID and InvalidClassException

Every serializable class has a version number, written into the stream with the class description:

```java
private static final long serialVersionUID = 1L;   // any long; must be static final long to count
```

When reading, the stream's UID is compared with the local class's UID. If they differ —
`InvalidClassException: local class incompatible: stream classdesc serialVersionUID = …, local class
serialVersionUID = …`. If you do **not** declare one, the JVM computes a default from the class's
structure (name, fields, methods, interfaces…), so adding a method and recompiling can make every old
stream unreadable. Declaring it explicitly lets you evolve the class compatibly: added fields read as
defaults, removed fields are ignored.

| Exception | When | Typical cause |
|---|---|---|
| `NotSerializableException` | `writeObject` | a reachable object's class does not implement `Serializable` |
| `InvalidClassException` | `readObject` | UID mismatch, or no accessible no-arg constructor in the first non-serializable superclass |
| `ClassNotFoundException` | `readObject` | the reading JVM does not have the class |
| `EOFException` | `readObject` | reading past the last object |

All of them except `ClassNotFoundException` are `IOException`s (`NotSerializableException` and
`InvalidClassException` extend `ObjectStreamException`).

## Records, enums and shared references

**Records** are serialized differently from ordinary classes: only the component values are written, and
deserialization calls the **canonical constructor** with them. Any validation in a compact constructor
therefore runs again — a record cannot be resurrected in an invalid state.

```java predict
import java.io.*;

record Range(int lo, int hi) implements Serializable {
    Range {
        System.out.println("canonical " + lo + ".." + hi);
        if (lo > hi) throw new IllegalArgumentException();
    }
}

public class Main {
    public static void main(String[] args) throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (var out = new ObjectOutputStream(bytes)) { out.writeObject(new Range(1, 5)); }
        try (var in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            System.out.println(in.readObject());
        }
    }
}
```
```output
canonical 1..5
canonical 1..5
Range[lo=1, hi=5]
```

**Enums** are written by name and read back as the existing constant — `==` identity is preserved.

**Shared references.** Within one stream, each object is written once; later occurrences are stored as
back-references. Two fields pointing to the same list come back pointing to the same (new) list. A
consequence: if you write an object, modify it, and write it again on the **same** stream, the second write
is just a reference to the first snapshot (`ObjectOutputStream.reset()` or `writeUnshared` avoid this).

## Customising: writeObject/readObject hooks and Externalizable

A serializable class can take control of its own fields by declaring these exact **private** methods. The
streams find them by reflection, so the signature must match exactly:

```java
private void writeObject(ObjectOutputStream out) throws IOException
private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException
```

Call `out.defaultWriteObject()` / `in.defaultReadObject()` first to handle the normal fields, then
write/read extra data **in the same order**:

```java predict
import java.io.*;

class Session implements Serializable {
    String user;
    transient String password;                  // never write secrets in clear text…
    Session(String user, String password) { this.user = user; this.password = password; }

    private void writeObject(ObjectOutputStream out) throws IOException {
        out.defaultWriteObject();
        out.writeUTF(new StringBuilder(password).reverse().toString());   // …"encrypt" it
    }
    private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException {
        in.defaultReadObject();
        password = new StringBuilder(in.readUTF()).reverse().toString();
    }
}

public class Main {
    public static void main(String[] args) throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (var out = new ObjectOutputStream(bytes)) { out.writeObject(new Session("ana", "s3cret")); }
        try (var in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            Session s = (Session) in.readObject();
            System.out.println(s.user + " " + s.password);
        }
    }
}
```
```output
ana s3cret
```

**`Externalizable`** (extends `Serializable`) hands *all* control to the class: it must implement
`writeExternal(ObjectOutput)` and `readExternal(ObjectInput)`, and it **must have a public no-arg
constructor**, which deserialization calls before `readExternal`. Nothing is written automatically.

> [!REAL]
> Java serialization has a long history of security vulnerabilities when reading untrusted data. Modern
> code prefers JSON/Protobuf; if you must deserialize, install an `ObjectInputFilter` (Java 9+). The exam
> still tests the mechanics above.

## What if…? One change at a time

| Change | Result |
|---|---|
| Remove `implements Serializable` from a field's class | `NotSerializableException` on `writeObject` |
| Mark that field `transient` | serialization succeeds; the field reads back as `null` |
| Parent (non-serializable) has only `Parent(int)` | write succeeds; `readObject` throws `InvalidClassException: …; no valid constructor` |
| Make the parent `Serializable` too | no constructor of either class runs on read; parent fields are restored from the stream |
| Change `serialVersionUID` between writing and reading | `InvalidClassException` (local class incompatible) |
| `static` field changed after writing | reads show the current static value |
| Class is a record | canonical constructor runs on read |
| Declare `writeObject` as `public` | not used as a hook — the default mechanism runs instead |

## Exam traps checklist

> [!TRAP]
> - `Serializable` has no methods; `Externalizable` has two and needs a public no-arg constructor.
> - Constructors and initializers of **serializable** classes do not run on deserialization; the first **non-serializable** superclass's no-arg constructor does.
> - `transient` fields come back as `0`/`false`/`null`, even if they have an initializer.
> - `static` fields are never serialized.
> - `NotSerializableException` happens on write; `InvalidClassException` (no valid constructor, UID mismatch) on read.
> - `readObject()` returns `Object` and throws `ClassNotFoundException` as well as `IOException`.
> - Records go through their canonical constructor on read.
