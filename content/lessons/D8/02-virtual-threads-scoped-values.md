---
id: conc-virtual-scoped
domain: D8
order: 2
title: Virtual Threads & Scoped Values
summary: Millions of cheap threads that block without hurting anyone — the Thread builders, what makes virtual threads different, why you never pool them — and Java 25's final Scoped Values, the immutable, bounded replacement for many ThreadLocal uses.
minutes: 45
objectives: [D8.1]
prerequisites: [conc-threads-executors]
contract:
  - Create virtual and platform threads with Thread.ofVirtual(), Thread.ofPlatform(), Thread.startVirtualThread and newVirtualThreadPerTaskExecutor, and state which properties of a virtual thread are fixed.
  - Explain when virtual threads improve throughput (many blocking tasks) and when they do not (CPU-bound work), and why they must not be pooled.
  - Bind, read and rebind a ScopedValue with where(...).run/call, and predict get(), isBound(), orElse() inside and outside the binding.
  - Contrast ScopedValue with ThreadLocal on mutability, lifetime and inheritance.
keyRules:
  - "Virtual threads are always daemon threads: `setDaemon(false)` throws IllegalArgumentException and `Thread.Builder.OfVirtual` has no `daemon(...)` method."
  - "Virtual threads always have priority NORM_PRIORITY (5); setPriority is ignored."
  - "`Thread.ofVirtual()` / `Thread.ofPlatform()` return builders: `start(r)`, `unstarted(r)`, `factory()`, `name(prefix, start)`."
  - "Do not pool virtual threads: create one per task (`newVirtualThreadPerTaskExecutor`). Limit concurrency with a Semaphore instead."
  - "Virtual threads help throughput for blocking (I/O-bound) work, not speed of CPU-bound work."
  - "ScopedValue (final in Java 25, JEP 506): `ScopedValue.newInstance()`, then `ScopedValue.where(KEY, value).run(Runnable)` or `.call(CallableOp)`."
  - "`get()` on an unbound ScopedValue throws NoSuchElementException; `isBound()` and `orElse(other)` let you test first."
  - "A ScopedValue has no `set`: a nested `where(...)` rebinds it for the inner scope only, and the outer value is visible again afterwards."
  - "A binding is visible only to the thread that called run/call (and to StructuredTaskScope forks — preview); a thread or executor task started inside the scope does not see it."
retrieval:
  - Name four ways to create a virtual thread.
  - Write from memory a program that binds a ScopedValue to "alice", rebinds it to "bob" in a nested scope, and prints the value before, inside and after the nested scope.
  - Give three differences between ThreadLocal and ScopedValue.
  - Why is a thread pool of virtual threads an anti-pattern, and what do you use instead to cap concurrency?
checks: []
mastery: [D8-VT-002, D8-VT-004, D8-SV-002, D8-SV-004, D8-SV-005]
---

## Mental model: threads as cheap as objects

A platform thread is a thin wrapper around an operating-system thread. When it blocks on I/O — waiting for a
database or an HTTP response — the OS thread blocks too, holding about a megabyte of stack. A server that
handles one request per thread therefore runs out of threads long before it runs out of CPU.

A **virtual thread** (final since Java 21, JEP 444) is a `java.lang.Thread` whose stack lives on the heap.
The JDK runs it by **mounting** it on a *carrier* platform thread from a small `ForkJoinPool`. When the
virtual thread blocks in a JDK blocking operation (socket read, `sleep`, `BlockingQueue.take`, lock wait),
the JDK **unmounts** it and the carrier picks up another virtual thread. Blocking becomes cheap, so you can
go back to the simple thread-per-task style with a million tasks.

> [!NOTE]
> Virtual threads make blocking cheap; they do **not** make code run faster. A CPU-bound computation still
> needs a CPU core — 10 000 virtual threads crunching numbers are no faster than a pool sized to the core count.

## Creating threads: builders and factories

```java
Thread v1 = Thread.ofVirtual().start(task);                 // started virtual thread (no name by default)
Thread v2 = Thread.ofVirtual().name("req-", 0).unstarted(task); // NEW, named req-0
Thread v3 = Thread.startVirtualThread(task);                 // shortcut for ofVirtual().start(task)
ThreadFactory vf = Thread.ofVirtual().factory();             // for APIs that want a ThreadFactory

Thread p1 = Thread.ofPlatform().name("io-", 1).daemon().start(task);  // io-1, daemon platform thread
ThreadFactory pf = Thread.ofPlatform().name("w-", 1).factory();       // w-1, w-2, w-3 …

try (ExecutorService ex = Executors.newVirtualThreadPerTaskExecutor()) {   // one new virtual thread per task
    ex.submit(task);
}
```

Fixed properties of a virtual thread:

| Property | Virtual thread | Platform thread |
|---|---|---|
| `isVirtual()` | `true` | `false` |
| `isDaemon()` | always `true` — `setDaemon(false)` ⇒ `IllegalArgumentException` | inherited (main ⇒ `false`), changeable before start |
| priority | always `Thread.NORM_PRIORITY` (5); `setPriority` is ignored | changeable |
| default name | empty string `""` | `Thread-N` |
| `new Thread(...)` | can never create one | yes |
| builder method `daemon(...)` | does not exist on `OfVirtual` (compile error) | `ofPlatform().daemon()` |

```java predict
public class Main {
    public static void main(String[] args) throws InterruptedException {
        Thread v = Thread.ofVirtual().unstarted(() -> System.out.println("virtual? " + Thread.currentThread().isVirtual()));
        System.out.println(v.isDaemon() + " " + v.getState() + " [" + v.getName() + "]");
        v.setPriority(Thread.MAX_PRIORITY);
        System.out.println(v.getPriority());
        v.start();
        v.join();
        Thread p = Thread.ofPlatform().name("w-", 1).unstarted(() -> { });
        System.out.println(p.getName() + " " + p.isDaemon() + " " + p.isVirtual());
        try {
            v.setDaemon(false);
        } catch (IllegalArgumentException e) {
            System.out.println("IAE: " + e.getMessage());
        }
    }
}
```
```output
true NEW []
5
virtual? true
w-1 false false
IAE: 'false' not legal for virtual threads
```

::check D8-VT-001

Because virtual threads are daemon threads, the JVM does **not** wait for them. A `main` method that starts
virtual threads and returns may exit before they print anything — always `join()` them, wait on their
futures, or let `close()` of a virtual-thread executor wait for you.

## Using virtual threads well

**Thread-per-task, no pooling.** A pool exists to amortize the cost of creating expensive threads and to cap
how many exist. Virtual threads are cheap to create, so pooling them only adds a queue and a bottleneck.
Use `Executors.newVirtualThreadPerTaskExecutor()` — it creates a fresh virtual thread for every task. If you
must limit concurrency (e.g. at most 10 calls to a fragile service), guard the call with a `Semaphore`.

```java predict
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class Main {
    public static void main(String[] args) {
        AtomicInteger done = new AtomicInteger();
        try (ExecutorService ex = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 10_000; i++) {
                ex.submit(() -> {
                    Thread.sleep(10);            // blocking: the carrier is released meanwhile
                    return done.incrementAndGet();
                });
            }
        }                                        // close() waits for all 10 000 tasks
        System.out.println(done.get());
    }
}
```
```output
10000
```

Ten thousand sleeping platform threads would cost ~10 GB of reserved stack; ten thousand virtual threads cost
almost nothing. We print only the **count** — the order in which tasks finish is unspecified.

**Pinning.** A virtual thread is *pinned* to its carrier when it cannot be unmounted while blocking — then it
blocks the carrier like a platform thread would. Calling native code (JNI) pins. The old advice was "prefer
`ReentrantLock` over `synchronized` in virtual threads" because blocking inside `synchronized` pinned.

> [!NOTE] Beyond the exam
> JDK 24 (JEP 491, *Synchronize Virtual Threads without Pinning*) reworked monitors so that a virtual thread
> blocking inside `synchronized` — or in `Object.wait()` — unmounts normally. On Java 25 `synchronized` no
> longer pins; native frames still do. You may still meet the older advice in material written for Java 21.

**ThreadLocals still work** in virtual threads, but with a million threads each holding its own copy of a
heavy object (a cache, a formatter), memory explodes. That is one motivation for scoped values.

## Scoped values (Java 25, JEP 506)

> [!J25]
> `java.lang.ScopedValue` is **final in Java 25** (JEP 506) after previews in Java 21–24. It lets a method
> share an immutable value with every method it calls — directly or indirectly — for a bounded period,
> without passing it as a parameter.

```java
static final ScopedValue<String> USER = ScopedValue.newInstance();   // usually static final; no public constructor

ScopedValue.where(USER, "ann").run(() -> handle());        // Runnable: no result
String r = ScopedValue.where(USER, "ann").call(() -> compute());   // CallableOp<T, X>: returns T, may throw X
ScopedValue.where(USER, "ann").where(TENANT, 42).run(...);         // bind several at once
```

| Method | Behaviour |
|---|---|
| `get()` | the value bound in the current thread; **unbound ⇒ `NoSuchElementException`** |
| `isBound()` | `true` inside a binding |
| `orElse(other)` | the bound value, or `other` when unbound (`other` must not be null ⇒ `NullPointerException`) |
| `orElseThrow(supplier)` | the bound value, or throws the supplied exception |

`call` takes a `ScopedValue.CallableOp<T, X extends Throwable>`, not a `java.util.concurrent.Callable`. Its
`call()` throws exactly the exception type `X` the lambda can throw, so a lambda that throws no checked
exception needs no `try`/`catch`, while one that can throw `IOException` makes `call(...)` throw
`IOException`.

The binding is **one-way and immutable**: there is no `set`. Inside a binding you can open a nested binding
of the same key; the inner value *shadows* the outer one only while the nested `run`/`call` executes.

```java predict
public class Main {
    static final ScopedValue<Integer> DEPTH = ScopedValue.newInstance();

    static void show(String label) {
        System.out.println(label + "=" + DEPTH.orElse(0) + " bound=" + DEPTH.isBound());
    }

    public static void main(String[] args) {
        show("before");
        ScopedValue.where(DEPTH, 1).run(() -> {
            show("outer");
            ScopedValue.where(DEPTH, DEPTH.get() + 1).run(() -> show("inner"));
            show("outer again");
        });
        show("after");
        String upper = ScopedValue.where(DEPTH, 7).call(() -> "seven".toUpperCase() + DEPTH.get());
        System.out.println(upper);
        try {
            DEPTH.get();
        } catch (java.util.NoSuchElementException e) {
            System.out.println(e.getMessage());
        }
    }
}
```
```output
before=0 bound=false
outer=1 bound=true
inner=2 bound=true
outer again=1 bound=true
after=0 bound=false
SEVEN7
ScopedValue not bound
```

::check D8-SV-001

**Bindings belong to a thread.** A new thread — platform or virtual — or a task handed to an executor does
**not** inherit the binding (unlike `InheritableThreadLocal`). Only forks of a `StructuredTaskScope` inherit
scoped values. To pass the value on, re-bind it in the new task explicitly:

```java predict
import java.util.concurrent.*;

public class Main {
    static final ScopedValue<String> REQUEST = ScopedValue.newInstance();

    public static void main(String[] args) {
        try (ExecutorService ex = Executors.newVirtualThreadPerTaskExecutor()) {
            ScopedValue.where(REQUEST, "req-1").run(() -> {
                Future<String> lost = ex.submit(() -> REQUEST.orElse("unbound"));
                String id = REQUEST.get();
                Future<String> kept = ex.submit(() -> ScopedValue.where(REQUEST, id).call(REQUEST::get));
                try {
                    System.out.println(lost.get() + " / " + kept.get());
                } catch (InterruptedException | ExecutionException e) {
                    throw new IllegalStateException(e);
                }
            });
        }
    }
}
```
```output
unbound / req-1
```

> [!NOTE] Beyond the exam
> `StructuredTaskScope` (structured concurrency) is still a **preview** API in Java 25 (JEP 505). Subtasks
> forked inside a scope automatically see the scoped-value bindings of the thread that opened the scope. You
> need `--enable-preview` to use it, and it is not part of the 1Z0-831 objectives.

## ThreadLocal vs ScopedValue

| | `ThreadLocal<T>` | `ScopedValue<T>` |
|---|---|---|
| Write | `set(v)` anywhere, any number of times | only by binding with `where(...).run/call` |
| Lifetime | until `remove()` or the thread dies — leaks in pools | exactly the dynamic extent of `run`/`call` |
| Unset read | `get()` returns `null` or the `withInitial` value | `get()` throws `NoSuchElementException` |
| Child threads | `InheritableThreadLocal` copies values to new threads | not inherited, except by `StructuredTaskScope` forks |
| Cost with millions of virtual threads | one map entry per thread | cheap: shares the binding, no copying |

```java predict
public class Main {
    static final ThreadLocal<String> TL = ThreadLocal.withInitial(() -> "init");
    static final InheritableThreadLocal<String> ITL = new InheritableThreadLocal<>();

    public static void main(String[] args) throws InterruptedException {
        TL.set("main-value");
        ITL.set("parent-value");
        Thread child = new Thread(() -> System.out.println(TL.get() + " " + ITL.get()));
        child.start();
        child.join();
        System.out.println(TL.get());
        TL.remove();
        System.out.println(TL.get());
    }
}
```
```output
init parent-value
main-value
init
```

::check D8-SV-003

## What if…? One change at a time

| Change | Result |
|---|---|
| `Thread.ofVirtual().daemon(false)` | compile error: `OfVirtual` has no `daemon(boolean)` method |
| `v.setDaemon(true)` on a virtual thread | allowed (no-op) — only `false` is rejected |
| `new ScopedValue<>()` | compile error: no accessible constructor; use `newInstance()` |
| `KEY.set("x")` | compile error: there is no `set` method |
| `KEY.get()` after `run(...)` has returned | `NoSuchElementException: ScopedValue not bound` |
| `KEY.orElse(null)` while unbound | `NullPointerException` |
| `ScopedValue.where(KEY, null).run(...)` | allowed in Java 25 — `get()` returns `null` |
| `call(() -> { throw new IOException(); })` without catch/throws | compile error: unreported `IOException` |
| Start `Thread.ofVirtual().start(...)` inside a binding and read the key there | `isBound()` is `false` in the new thread |
| Pool virtual threads with `newFixedThreadPool(10, Thread.ofVirtual().factory())` | works, but defeats the point; use a `Semaphore` for limits |

## Exam traps checklist

> [!TRAP]
> - Virtual threads are **always daemon** and always priority 5. `main` returning does not wait for them.
> - `Thread.ofVirtual()` returns a builder, not a thread — `start(r)` starts, `unstarted(r)` does not.
> - `new Thread(...)` always creates a **platform** thread.
> - Virtual threads improve **throughput of blocking work**, not latency of CPU-bound work.
> - `ScopedValue.get()` outside a binding throws `NoSuchElementException` — it never returns `null` for "unbound".
> - A nested binding of the same key shadows the outer one only inside the nested `run`/`call`.
> - Executor tasks and new threads do **not** inherit scoped-value bindings.

## Practice

::check D8-VT-003

::check D8-SV-006
