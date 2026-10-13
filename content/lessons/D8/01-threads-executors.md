---
id: conc-threads-executors
domain: D8
order: 1
title: Threads, Executors, Futures & CompletableFuture
summary: From a single Thread to thread pools — lifecycle and states, start vs run, interrupts, Runnable vs Callable, ExecutorService and Future, shutdown vs close, scheduling, and composing async work with CompletableFuture.
minutes: 55
objectives: [D8.1]
prerequisites: []
contract:
  - Create and start platform threads, name the six Thread.State values and say which call moves a thread between them.
  - Predict what start(), run(), join(), sleep() and interrupt() do — including which exception each one can throw.
  - Choose Runnable or Callable and submit or execute, and predict how a task's exception reaches (or does not reach) the caller.
  - Explain shutdown, shutdownNow, awaitTermination and close() precisely, and use invokeAll/invokeAny and ScheduledExecutorService.
  - Compose asynchronous work with CompletableFuture (supplyAsync, thenApply, thenCompose, thenCombine, exceptionally, handle, join).
keyRules:
  - "`start()` creates a new thread of execution that runs `run()`; calling `run()` directly just runs the body on the current thread."
  - "A Thread can be started only once — a second `start()` throws `IllegalThreadStateException`, even after it terminated."
  - "`Runnable.run()` returns nothing and cannot throw checked exceptions; `Callable<V>.call()` returns V and may throw Exception."
  - "`execute(Runnable)` returns void and only accepts a Runnable; `submit(...)` accepts Runnable or Callable and returns a Future."
  - "An exception thrown by a submitted task is captured in the Future; `get()` throws `ExecutionException` whose `getCause()` is the original."
  - "`shutdown()` stops accepting tasks but lets queued tasks finish; `shutdownNow()` also interrupts running tasks and returns the never-started ones; neither waits."
  - "Since Java 19, ExecutorService is AutoCloseable: `close()` = shutdown + wait until all tasks have finished."
  - "Catching InterruptedException clears the thread's interrupt flag; `Thread.interrupted()` reads AND clears it."
  - "CompletableFuture.join() wraps failures in unchecked CompletionException; get() wraps them in checked ExecutionException."
retrieval:
  - List the six Thread.State values and one method call that leads into each of BLOCKED, WAITING and TIMED_WAITING.
  - Without looking, write the difference between shutdown(), shutdownNow(), awaitTermination() and close().
  - What exception does Future.get() throw when the task threw IllegalStateException, and how do you get the original back?
  - Explain the difference between thenApply and thenCompose with one sentence and one signature each.
checks: []
mastery: [D8-THR-002, D8-THR-004, D8-THR-006, D8-THR-008]
---

## Mental model: a thread is a separate call stack

A Java program starts with one thread, `main`. A **thread** is an independent call stack that the JVM can
run at the same time as other threads, sharing the same heap (objects and static fields) but with its own
local variables. Concurrency bugs come from that split: locals are private, everything reachable from
fields is shared.

Java 21+ has two kinds of `Thread`:

| | Platform thread | Virtual thread |
|---|---|---|
| Backed by | one OS thread for its whole life | mounted on a small pool of carrier (platform) threads only while running |
| Cost | ~1 MB stack, OS scheduling — hundreds to a few thousand | a few hundred bytes — millions are fine |
| Created by | `new Thread(r)`, `Thread.ofPlatform()`, most `Executors` factories | `Thread.ofVirtual()`, `Thread.startVirtualThread(r)`, `Executors.newVirtualThreadPerTaskExecutor()` |
| Daemon? | inherits from creator (main ⇒ non-daemon) | **always** daemon |

Both are `java.lang.Thread` objects with the same API. The next lesson covers virtual threads in depth; here
we learn the API that applies to both.

**Nothing about the relative timing of two threads is guaranteed** unless you create the guarantee with a
synchronization action — `join()`, `Future.get()`, a lock, a latch. Every example in this lesson is
deterministic only because it uses one of those.

## Thread basics: start, run, join, sleep, interrupt

```java
Runnable task = () -> System.out.println("hi from " + Thread.currentThread().getName());
Thread t1 = new Thread(task, "worker");          // platform thread, NEW state
Thread t2 = Thread.ofPlatform().name("w-", 1).start(task);   // builder: named w-1, already started
t1.start();                                       // NEW -> RUNNABLE; the JVM calls run() on the new thread
t1.join();                                        // current thread waits until t1 is TERMINATED
```

The **life cycle** is described by `Thread.State`:

| State | Meaning | Typical way in |
|---|---|---|
| `NEW` | created, not started | `new Thread(...)`, `builder.unstarted(...)` |
| `RUNNABLE` | running or ready to run | `start()` |
| `BLOCKED` | waiting to enter a `synchronized` block/method | another thread holds the monitor |
| `WAITING` | waiting with no time-out | `join()`, `Object.wait()`, `LockSupport.park()` |
| `TIMED_WAITING` | waiting with a time-out | `sleep(ms)`, `join(ms)`, `wait(ms)` |
| `TERMINATED` | `run()` has finished (normally or by exception) | — |

`start()` vs `run()` is the classic trap. `run()` is an ordinary method: calling it executes the body on the
**current** thread, synchronously.

```java predict
public class Main {
    public static void main(String[] args) throws InterruptedException {
        Thread t = new Thread(() -> System.out.println("body on " + Thread.currentThread().getName()), "worker");
        System.out.println(t.getState());
        t.run();
        t.start();
        t.join();
        System.out.println(t.getState() + " " + t.isAlive());
    }
}
```
```output
NEW
body on main
body on worker
TERMINATED false
```

The order is deterministic: `t.run()` finishes before `t.start()` is even called, and `join()` makes `main`
wait for the worker before printing the final state.

::check D8-THR-001

**Interrupts are a request, not a kill.** `t.interrupt()` sets t's interrupt flag. If t is blocked in
`sleep`, `wait` or `join` (or is about to call one), that method throws `InterruptedException` — and the
flag is **cleared** when the exception is thrown. Code that is not blocking must poll
`Thread.currentThread().isInterrupted()` itself. The static `Thread.interrupted()` returns the current
thread's flag **and clears it**.

```java predict
public class Main {
    public static void main(String[] args) throws InterruptedException {
        Thread sleeper = new Thread(() -> {
            try {
                Thread.sleep(5_000);
                System.out.println("woke up");
            } catch (InterruptedException e) {
                System.out.println("interrupted, flag=" + Thread.currentThread().isInterrupted());
            }
        });
        sleeper.start();
        sleeper.interrupt();
        sleeper.join();
        Thread.currentThread().interrupt();
        System.out.println(Thread.interrupted() + " " + Thread.interrupted());
    }
}
```
```output
interrupted, flag=false
true false
```

> [!RULE]
> `Thread.sleep(...)`, `join()` and `Object.wait()` declare the **checked** `InterruptedException`. Inside a
> `Runnable` lambda you must catch it — `Runnable.run()` declares no checked exceptions, so
> `() -> { Thread.sleep(10); }` does not compile as a Runnable.

**Daemon threads.** The JVM exits when the last **non-daemon** thread ends; daemon threads are abandoned.
`setDaemon(true)` must be called before `start()` (otherwise `IllegalThreadStateException`). An uncaught
exception in a thread terminates only that thread: the default handler prints
`Exception in thread "Thread-0" ...` to stderr and the other threads keep running.

## Runnable vs Callable, execute vs submit

```java
@FunctionalInterface interface Runnable    { void run(); }
@FunctionalInterface interface Callable<V> { V call() throws Exception; }
```

An `ExecutorService` owns a set of threads and a task queue, so you stop creating threads by hand:

| Factory (`Executors.`) | Threads |
|---|---|
| `newSingleThreadExecutor()` | exactly one worker, tasks run **one at a time in submission order** |
| `newFixedThreadPool(n)` | n reusable workers, unbounded queue |
| `newCachedThreadPool()` | creates threads on demand, reuses idle ones (idle 60 s ⇒ removed) |
| `newVirtualThreadPerTaskExecutor()` | a **new virtual thread for every task**, no pooling |
| `newSingleThreadScheduledExecutor()`, `newScheduledThreadPool(n)` | run tasks after a delay or periodically |

| Method | Accepts | Returns | A task exception… |
|---|---|---|---|
| `void execute(Runnable)` (from `Executor`) | Runnable only | nothing | goes to the worker thread's uncaught-exception handler (printed to stderr) |
| `Future<?> submit(Runnable)` | Runnable | Future whose `get()` returns `null` | is stored in the Future |
| `Future<T> submit(Runnable, T result)` | Runnable | Future whose `get()` returns `result` | is stored in the Future |
| `Future<T> submit(Callable<T>)` | Callable | Future of the value | is stored in the Future |

The compiler picks `Runnable` or `Callable` from the **lambda's shape**: a lambda that returns a value (or
whose body cannot complete normally, like one that only `throw`s) is Callable-compatible; a statement
lambda that returns nothing is only Runnable-compatible. That is why `submit(() -> { Thread.sleep(10); })`
fails to compile (Runnable, unhandled `InterruptedException`) while
`submit(() -> { Thread.sleep(10); return null; })` compiles (Callable may throw).

`Future<V>` gives you `get()` (blocks), `get(timeout, unit)` (throws `TimeoutException`), `isDone()`,
`cancel(mayInterrupt)`, `isCancelled()`, and (Java 19+) `state()`, `resultNow()`, `exceptionNow()`.

```java predict
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
            Future<Integer> ok  = pool.submit(() -> 6 * 7);
            Future<Integer> bad = pool.submit(() -> Integer.parseInt("forty-two"));
            Future<?>       run = pool.submit(() -> System.out.println("runnable ran"));
            try {
                System.out.println(ok.get() + " " + run.get());
                bad.get();
            } catch (ExecutionException e) {
                System.out.println("wrapped: " + e.getCause().getClass().getSimpleName());
                System.out.println(bad.isDone() + " " + bad.state());
            }
        }
    }
}
```
```output
runnable ran
42 null
wrapped: NumberFormatException
true FAILED
```

`ok.get()` and `run.get()` both block until their task is done, so "runnable ran" is printed (by the
worker) before `main` prints `42 null`. A failed task is still **done** — `isDone()` means "finished in any
way: normally, exceptionally or cancelled".

::check D8-THR-003

**Bulk operations.** `invokeAll(tasks)` runs every Callable and returns, once **all** are done, a
`List<Future<T>>` in the same order as the input list (each future may hold a value or an exception).
`invokeAny(tasks)` returns the **result** (not a Future) of one task that completed successfully and cancels
the rest; it throws `ExecutionException` only if every task failed.

## Shutting an executor down

| Call | Accepts new tasks? | Queued tasks | Running tasks | Blocks the caller? |
|---|---|---|---|---|
| `shutdown()` | no ⇒ `RejectedExecutionException` | still run | finish | no |
| `shutdownNow()` | no | removed and **returned** as `List<Runnable>` | interrupted | no |
| `awaitTermination(t, unit)` | — | — | — | yes, until terminated or time-out; returns boolean |
| `close()` (Java 19+) | no | still run | finish | **yes**, until all tasks finished |

```java predict
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        ExecutorService pool = Executors.newSingleThreadExecutor();
        CountDownLatch started = new CountDownLatch(1);
        pool.submit(() -> { started.countDown(); Thread.sleep(10_000); return "slow"; });
        pool.submit(() -> "queued-1");
        pool.submit(() -> "queued-2");
        started.await();                              // the first task is now running
        List<Runnable> neverStarted = pool.shutdownNow();
        System.out.println(neverStarted.size() + " " + pool.isShutdown());
        System.out.println(pool.awaitTermination(1, TimeUnit.SECONDS) + " " + pool.isTerminated());
        try {
            pool.submit(() -> "late");
        } catch (RejectedExecutionException e) {
            System.out.println("rejected");
        }
    }
}
```
```output
2 true
true true
rejected
```

The running task was interrupted out of `sleep`, the two queued tasks were handed back, and the
terminated executor rejects new work.

> [!J25]
> `ExecutorService extends AutoCloseable` since Java 19 (it arrived with Project Loom, JEP 425/444), so a
> try-with-resources block is the idiomatic way to use a short-lived executor: leaving the block calls
> `close()`, which shuts down **and waits**. Forgetting `shutdown()` on a platform-thread pool keeps the JVM
> alive, because pool threads are non-daemon.

**Scheduling.** `ScheduledExecutorService` adds `schedule(callableOrRunnable, delay, unit)` (returns a
`ScheduledFuture`), `scheduleAtFixedRate(r, initialDelay, period, unit)` (start times are `period` apart)
and `scheduleWithFixedDelay(r, initialDelay, delay, unit)` (the gap is measured from the end of one run to
the start of the next). The periodic methods take only a `Runnable`; if one run throws, later runs are
suppressed.

## CompletableFuture: composing asynchronous steps

`CompletableFuture<T>` implements both `Future<T>` and `CompletionStage<T>`. Without an explicit executor,
the `...Async` methods run on `ForkJoinPool.commonPool()`.

| Method | Function shape | Use it to |
|---|---|---|
| `supplyAsync(Supplier<T>)` / `runAsync(Runnable)` | — | start async work |
| `thenApply(T -> U)` | map | transform the value |
| `thenAccept(T -> void)` / `thenRun(() -> void)` | consume | side-effect, result `Void` |
| `thenCompose(T -> CompletionStage<U>)` | flatMap | chain another async step without nesting `CF<CF<U>>` |
| `thenCombine(other, (T, U) -> V)` | zip | combine two independent futures |
| `exceptionally(Throwable -> T)` | recover | runs **only** on failure |
| `handle((T, Throwable) -> U)` | both | runs always; exactly one argument is non-null (unless the value itself is null) |
| `join()` / `get()` | — | wait; failure ⇒ `CompletionException` (unchecked) / `ExecutionException` (checked) |

```java predict
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        int total = CompletableFuture.supplyAsync(() -> 5)
                .thenApply(x -> x * 2)
                .thenCompose(x -> CompletableFuture.supplyAsync(() -> x + 1))
                .thenCombine(CompletableFuture.completedFuture(100), Integer::sum)
                .join();
        System.out.println(total);

        String recovered = CompletableFuture.supplyAsync(() -> 10 / 0)
                .thenApply(x -> "never " + x)
                .exceptionally(t -> "recovered from " + t.getClass().getSimpleName()
                        + " caused by " + t.getCause().getClass().getSimpleName())
                .join();
        System.out.println(recovered);

        try {
            CompletableFuture.supplyAsync(() -> 10 / 0).join();
        } catch (CompletionException e) {
            System.out.println("join threw CompletionException: " + e.getCause().getMessage());
        }
    }
}
```
```output
111
recovered from CompletionException caused by ArithmeticException
join threw CompletionException: / by zero
```

> [!TRAP]
> When the exception is thrown **inside** an async stage, the stages downstream see it wrapped in a
> `CompletionException`. But a future completed with `CompletableFuture.failedFuture(ex)` (or
> `completeExceptionally(ex)`) and handled directly passes the **raw** `ex` to `exceptionally`/`handle`.
> Do not assume `t instanceof ArithmeticException` — test `t.getCause()` too.

## What if…? One change at a time

| Change | Result |
|---|---|
| Call `t.start()` a second time after `join()` | `IllegalThreadStateException` — a terminated thread cannot be restarted |
| Replace `t.start()` with `t.run()` | body runs on `main`; no new thread is created |
| `t.setDaemon(true)` after `t.start()` | `IllegalThreadStateException` |
| `ex.execute(callable)` where `callable` is a `Callable<String>` variable | compile error: Callable cannot be converted to Runnable |
| `Future<String> f = ex.submit(() -> System.out.println("x"));` | compile error: a void lambda selects `submit(Runnable)` ⇒ `Future<?>` |
| Task throws, submitted with `execute` instead of `submit` | exception printed by the worker thread's handler; nobody else sees it |
| Remove `try`-with-resources and never call `shutdown()` on a fixed pool | `main` ends but the JVM keeps running (non-daemon workers) |
| `future.get()` on a cancelled future | `CancellationException` (unchecked) |
| `invokeAny` where every task throws | `ExecutionException` |

## Exam traps checklist

> [!TRAP]
> - `run()` ≠ `start()`. Only `start()` creates a new thread. Starting twice ⇒ `IllegalThreadStateException`.
> - `Future.get()` throws **two** checked exceptions: `InterruptedException` and `ExecutionException`. The
>   task's original exception is `getCause()`, never thrown directly.
> - `shutdown()` does not wait and does not interrupt; `shutdownNow()` does not wait either. Only
>   `awaitTermination` and `close()` block.
> - `submit(Runnable)` ⇒ `Future<?>` whose `get()` returns `null`.
> - `invokeAll` returns futures in **input order**, regardless of which finished first; `invokeAny` returns a
>   plain value.
> - Catching `InterruptedException` clears the flag — restore it with `Thread.currentThread().interrupt()`
>   if you cannot handle it.
> - `CompletableFuture.join()` throws unchecked `CompletionException`; `get()` throws checked
>   `ExecutionException`.

## Practice

Work through these, then take the mastery quiz. For each one, say out loud *which synchronization action*
makes the output deterministic.

::check D8-THR-005

::check D8-THR-007
