---
name: unix-thread-management
description: Comprehensive workflow and command reference for diagnosing, inspecting, and managing Unix/Linux processes and their individual threads. Use when dealing with high CPU usage, deadlock debugging, or OS-level concurrency issues.
---

# Unix Thread Management Skill

This skill provides a structured approach for inspecting and managing process threads on Unix/Linux systems. 

## Discovery and Inspection

### 1. Identify Threads for a Process
To view all threads belonging to a specific Process ID (PID):
```bash
# Using ps to show threads (-T)
ps -T -p <PID>

# Using top to show threads (-H) for a specific process
top -H -p <PID>
```

### 2. Global Thread Monitoring
To view all threads running on the system:
```bash
# Show all threads system-wide
ps -eT

# Interactive thread view
htop
# (Inside htop, press 'H' to toggle showing user threads)
```

### 3. Deep Dive into `/proc`
For raw kernel data regarding threads, inspect the `/proc/<PID>/task/` directory. Each subdirectory here represents a thread (Task ID / TID).
```bash
# List all threads for a PID
ls /proc/<PID>/task/

# Check specific thread status (State, CPU usage, etc.)
cat /proc/<PID>/task/<TID>/status
```

## Debugging and Diagnostics

### 1. Tracing System Calls
To trace system calls for a specific thread or all threads of a process:
```bash
# Trace all threads of a process (-f follows forks/threads)
strace -f -p <PID>

# Trace a specific thread
strace -p <TID>
```

### 2. Generating Core Dumps and Stack Traces
To see what a thread is currently executing (requires `gdb` or `pstack`):
```bash
# Print thread stack trace (if pstack is available)
pstack <PID>

# Using gdb to attach and get backtraces for all threads
gdb -ex "set pagination 0" -ex "thread apply all bt" -batch -p <PID>
```

## Management and Limits

### 1. Sending Signals to Specific Threads
Usually, signals are sent to the entire process group. To target a specific thread (TID) from the OS level, you can use `tgkill` (via custom C code or advanced gdb), but `kill` generally targets the Process Group. However, you can manage the process as a whole:
```bash
# Terminate the whole process
kill -15 <PID>
kill -9 <PID>
```

### 2. Checking Thread Limits
If an application fails to spawn new threads, check the OS limits:
```bash
# Check user limits (max user processes also limits threads)
ulimit -u

# Check system-wide thread limit
cat /proc/sys/kernel/threads-max

# Check PID max
cat /proc/sys/kernel/pid_max
```
