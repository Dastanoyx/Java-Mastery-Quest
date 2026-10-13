---
id: conc-thread-safety
domain: D8
order: 3
title: Thread Safety — synchronized, volatile, Atomics, Locks & Synchronizers
summary: Why count++ loses updates, and every tool the JDK gives you to stop it — monitors, volatile, happens-before, atomic variables, ReentrantLock and ReadWriteLock, Conditions, and the latch/barrier/semaphore trio — plus deadlock, livelock and starvation.
minutes: 55
objectives: [D8.2]
prerequisites: [conc-threads-executors]
contract:
  - Explain why `count++` on a shared field is a race and fix it three ways (synchronized, AtomicInteger, ReentrantLock).
  - Identify which object a synchronized method or block locks, and predict when two threads contend.
  - Distinguish visibility (volatile) from atomicity, and name the happens-before edges you rely on every day.
  - Use the AtomicInteger API (getAndIncrement vs incrementAndGet, compareAndSet, updateAndGet, accumulateAndGet) and predict its return values.
  - Use ReentrantLock and ReadWriteLock correctly (unlock in finally, tryLock, hold count, fairness) and define deadlock, livelock and starvation.
keyRules:
  - "`count++` is read–add–write: three steps that another thread can interleave with. It is not atomic, even on a volatile field."
  - "A synchronized instance method locks `this`; a static synchronized method locks the Class object (`Main.class`). They do not exclude each other."
  - "Monitors are reentrant: a thread that holds a lock can acquire it again."
  - "`volatile` guarantees visibility and ordering of a single read or write, not atomicity of compound actions."
  - "Happens-before: unlock → later lock of the same monitor; volatile write → later read; `Thread.start()` → actions in the thread; actions in a thread → a successful `join()`."
  - "`getAndX` returns the OLD value; `xAndGet` returns the NEW value; `compareAndSet(expected, new)` returns whether it swapped."
  - "Always `lock()` before `try` and `unlock()` in `finally`; unlocking a lock you do not hold throws IllegalMonitorStateException."
  - "`tryLock()` returns immediately with true/false; `ReentrantLock(true)` is fair (longest waiter first)."
  - "Several readers may hold a ReadWriteLock's read lock together; the write lock is exclusive."
retrieval:
  - Write the three machine steps hidden inside `count++` and an interleaving of two threads that loses an update.
  - Which object is locked by `static synchronized void a()` and by `synchronized void b()`? Can two threads run a() and b() at the same time?
  - What does `new AtomicInteger(5)` hold after `getAndIncrement()` then `incrementAndGet()`, and what did each call return?
  - Define deadlock, livelock and starvation in one sentence each.
checks: []
mastery: [D8-LCK-002, D8-LCK-004, D8-LCK-006, D8-LCK-008]
---

## Mental model: shared mutable state is the problem

A **race condition** happens when the result depends on how threads interleave. The canonical example:

```java
class Counter {
    private int count;
    void increment() { count++; }   // really: int tmp = count; tmp = tmp + 1; count = tmp;
}
```

Two threads read `count == 7`, both compute `8`, both write `8` — one increment is **lost**. Run four threads
that each increment 100 000 times and you typically see a total well below 400 000, and a different number
on every run. There are only three cures:

1. **Don't share** — confine data to one thread (locals, `ThreadLocal`, a per-task result you combine later).
2. **Don't mutate** — immutable objects (records with immutable components, `List.of`) are always thread-safe.
3. **Synchronize** — make the compound action atomic and its result visible: `synchronized`, `Lock`,
   atomic variables or a concurrent collection.

Thread safety has two halves. **Atomicity**: nobody sees a half-done compound action. **Visibility**: a
write by one thread is eventually seen by another. Without synchronization, the JIT and CPU may cache a
field in a register — a loop `while (!stop) {}` may never see another thread's `stop = true`.

## synchronized and the monitor

Every object has an intrinsic lock (monitor). `synchronized` acquires it on entry and releases it on exit —
also when the block exits by an exception.

```java
class Account {
    private int balance;
    synchronized void deposit(int x) { balance += x; }                 // locks this
    static synchronized void audit() { }                               // locks Account.class
    void withdraw(int x) { synchronized (this) { balance -= x; } }     // same lock as deposit
    private final Object lock = new Object();
    void log() { synchronized (lock) { /* … */ } }                      // a private lock object
}
```

| Declaration | Lock object |
|---|---|
| `synchronized` instance method | `this` |
| `static synchronized` method | the `Class` object, e.g. `Account.class` |
| `synchronized (expr) { … }` | the object `expr` evaluates to (must be a reference; `null` ⇒ `NullPointerException`) |

Two threads contend **only if they use the same lock object**. A static synchronized method and an instance
synchronized method of the same class use different locks and can run at the same time.

```java predict
public class Main {
    static synchronized void classLevel(Main m) {
        System.out.println("static: class=" + Thread.holdsLock(Main.class) + " this=" + Thread.holdsLock(m));
    }
    synchronized void instanceLevel() {
        System.out.println("instance: class=" + Thread.holdsLock(Main.class) + " this=" + Thread.holdsLock(this));
        synchronized (this) {                                // reentrant: same thread, same lock
            System.out.println("nested ok");
        }
    }
    public static void main(String[] args) {
        Main m = new Main();
        classLevel(m);
        m.instanceLevel();
    }
}
```
```output
static: class=true this=false
instance: class=false this=true
nested ok
```

The thread-safe counter, made deterministic with `join()`:

```java predict
public class Main {
    private int count;
    synchronized void increment() { count++; }

    public static void main(String[] args) throws InterruptedException {
        Main c = new Main();
        Thread[] workers = new Thread[4];
        for (int i = 0; i < workers.length; i++) {
            workers[i] = new Thread(() -> { for (int j = 0; j < 100_000; j++) c.increment(); });
            workers[i].start();
        }
        for (Thread w : workers) w.join();       // join() happens-before the read below
        System.out.println(c.count);
    }
}
```
```output
400000
```

`wait()`, `notify()` and `notifyAll()` must be called while holding that object's monitor, otherwise they
throw `IllegalMonitorStateException`. `synchronized` is not a legal modifier for a class, a constructor or
a field.

::check D8-LCK-001

## volatile and happens-before

`volatile` on a field means every read sees the most recent write by any thread, and writes before a
volatile write become visible to a thread that reads it. It is perfect for a **flag** written by one thread
and read by others. It does **not** make `count++` atomic, and `volatile final` is a compile error (*illegal
combination of modifiers*).

The Java Memory Model defines **happens-before** (JLS §17.4.5). If action A happens-before B, B sees A's
effects. The edges you use constantly:

- unlocking a monitor/Lock → every later lock of the same monitor/Lock
- a write to a volatile field → every later read of that field
- `t.start()` → every action in `t`; every action in `t` → another thread's successful return from `t.join()`
- submitting a task → its execution; a task's completion → `Future.get()` returning
- `countDown()` → a successful return from `await()`

That last list is why the examples in this domain print deterministic results: they read shared state only
*after* a `join`, `get`, `await` or `close`.

## Atomic variables

`java.util.concurrent.atomic` wraps a single variable and offers lock-free atomic compound operations built
on **compare-and-set (CAS)**.

| Method | Returns |
|---|---|
| `get()`, `set(v)` | current value / nothing |
| `incrementAndGet()`, `decrementAndGet()`, `addAndGet(d)` | the **new** value |
| `getAndIncrement()`, `getAndDecrement()`, `getAndAdd(d)`, `getAndSet(v)` | the **old** value |
| `compareAndSet(expect, update)` | `true` if the value was `expect` and is now `update` |
| `updateAndGet(f)` / `getAndUpdate(f)` | new / old value after applying `f` (may be retried — keep it side-effect free) |
| `accumulateAndGet(x, op)` / `getAndAccumulate(x, op)` | new / old value of `op(current, x)` |

```java predict
import java.util.concurrent.atomic.*;

public class Main {
    public static void main(String[] args) {
        AtomicInteger a = new AtomicInteger(5);
        System.out.println(a.getAndIncrement() + " " + a.incrementAndGet() + " " + a.get());
        System.out.println(a.compareAndSet(6, 10) + " " + a.compareAndSet(7, 10) + " " + a.get());
        System.out.println(a.updateAndGet(x -> x * 2) + " " + a.getAndUpdate(x -> x + 1) + " " + a.accumulateAndGet(3, Math::max));
        LongAdder hits = new LongAdder();
        hits.increment();
        hits.add(5);
        System.out.println(hits.sum());
    }
}
```
```output
5 7 7
false true 10
20 20 21
6
```

`LongAdder` keeps several internal cells to reduce contention when many threads add; read it with `sum()`.
It is faster than `AtomicLong` for write-heavy counters but has no `compareAndSet`.

::check D8-LCK-003

## Explicit locks: ReentrantLock, ReadWriteLock, Condition

`java.util.concurrent.locks.Lock` does what `synchronized` does, plus: try without blocking, time-outs,
interruptible waiting, fairness, and several wait-sets (`Condition`s).

```java
private final ReentrantLock lock = new ReentrantLock();      // new ReentrantLock(true) = fair
void transfer() {
    lock.lock();                 // BEFORE try: if lock() itself failed, finally must not unlock
    try {
        // critical section
    } finally {
        lock.unlock();           // ALWAYS in finally — an exception would otherwise leave it locked forever
    }
}
if (lock.tryLock()) { try { … } finally { lock.unlock(); } } else { /* do something else */ }
lock.tryLock(100, TimeUnit.MILLISECONDS);   // waits up to 100 ms, may throw InterruptedException
```

`ReentrantLock` is reentrant: the owner may lock again, and must unlock the same number of times. Each
`unlock()` decrements the **hold count**; at zero the lock is free. `unlock()` by a thread that does not
hold it ⇒ `IllegalMonitorStateException`.

```java predict
import java.util.concurrent.locks.*;

public class Main {
    public static void main(String[] args) {
        ReentrantLock lock = new ReentrantLock();
        lock.lock();
        lock.lock();
        System.out.println(lock.getHoldCount() + " " + lock.isLocked() + " " + lock.isFair());
        lock.unlock();
        System.out.println(lock.getHoldCount() + " " + lock.isLocked());
        lock.unlock();
        System.out.println(lock.getHoldCount() + " " + lock.isLocked());
        lock.unlock();
    }
}
```
```output
2 true false
1 true
0 false
Exception in thread "main" java.lang.IllegalMonitorStateException
```

**ReadWriteLock** (`ReentrantReadWriteLock`) has two locks: `readLock()` may be held by many threads at once
when no one holds the write lock; `writeLock()` is exclusive. Good for read-mostly data.

**Condition** is the `Lock` version of `wait`/`notify`: `Condition c = lock.newCondition();`, then
`c.await()` / `c.signal()` / `c.signalAll()` — only while holding the lock (else
`IllegalMonitorStateException`). Always wait in a loop: `while (!ready) c.await();`.

::check D8-LCK-005

## Synchronizers and liveness problems

| Class | Idea | Key methods |
|---|---|---|
| `CountDownLatch(n)` | one-shot gate: `await()` blocks until the count reaches 0; cannot be reset | `countDown()`, `await()`, `getCount()` |
| `CyclicBarrier(n, action)` | n threads wait for each other; when the last arrives, the optional action runs, then all continue; reusable | `await()` |
| `Semaphore(permits)` | at most *permits* threads in a section | `acquire()`, `tryAcquire()`, `release()`, `availablePermits()` |

Extra `countDown()` calls at zero have no effect. A `Semaphore` does not track owners — `release()` can
raise the permit count above its initial value.

```java predict
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(3);
        AtomicInteger sum = new AtomicInteger();
        for (int i = 1; i <= 3; i++) {
            int n = i;
            Thread.ofVirtual().start(() -> { sum.addAndGet(n * 10); done.countDown(); });
        }
        done.await();
        done.countDown();                       // already 0: no effect
        System.out.println(sum.get() + " " + done.getCount());
        Semaphore permits = new Semaphore(2);
        System.out.println(permits.tryAcquire() + " " + permits.tryAcquire() + " " + permits.tryAcquire());
        permits.release(3);
        System.out.println(permits.availablePermits());
    }
}
```
```output
60 0
true true false
3
```

**Liveness failures:**

- **Deadlock** — two or more threads each hold a lock the other needs and wait forever (T1 holds A wants B,
  T2 holds B wants A). Prevent it by always acquiring locks in the same global order, or by `tryLock` with a
  time-out.
- **Livelock** — threads are not blocked but keep reacting to each other and make no progress (two people
  stepping aside in a corridor, in the same direction, forever).
- **Starvation** — a thread is runnable but never gets the resource because others keep getting it first
  (e.g. an unfair lock under heavy contention). Fair locks reduce it.

## What if…? One change at a time

| Change | Result |
|---|---|
| Make `count` `volatile` instead of making `increment()` synchronized | still loses updates — volatile is not atomic |
| `static synchronized void m() { synchronized (this) { … } }` | compile error: `this` in a static context |
| `synchronized (x)` where `x` is an `int` | compile error: *unexpected type, required: reference* |
| `synchronized` on a constructor or class | compile error: *modifier synchronized not allowed here* |
| `obj.notify()` outside `synchronized (obj)` | `IllegalMonitorStateException` |
| `lock()` inside the `try` and `lock()` throws | `finally` calls `unlock()` on a lock not held ⇒ `IllegalMonitorStateException` hides the real error |
| Swap `incrementAndGet()` for `getAndIncrement()` in a print | prints the old value, one less |
| `tryLock()` while another thread holds the lock | returns `false` immediately |
| Fair lock `new ReentrantLock(true)` | waiting threads acquire in FIFO order; throughput drops |

## Exam traps checklist

> [!TRAP]
> - `volatile` ≠ atomic. `volatile int n; n++;` still races.
> - Static and instance `synchronized` methods use **different** locks.
> - `synchronized` blocks on a **reference**; a `String` literal or boxed `Integer` is a shared, interned
>   object — locking on it is legal but couples unrelated code.
> - `getAndIncrement()` returns the old value; `incrementAndGet()` the new one.
> - A `ReentrantLock` locked twice must be unlocked twice. There is no automatic release at the end of a
>   method — only `finally` saves you.
> - `CountDownLatch` cannot be reset; `CyclicBarrier` can be reused.
> - Deadlock = blocked forever; livelock = busy but no progress; starvation = one thread never gets a turn.

## Practice

::check D8-LCK-007

::exercise D8-EX-001
