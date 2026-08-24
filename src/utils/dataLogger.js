const LOG_KEY = "healthcare_task_logs";

export function logTaskEvent(task, eventType) {
  // eventType: "CREATED", "STARTED", "COMPLETED"
  const logs = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    taskId: task.id,
    patientId: task.patientId || "共通",
    ward: task.ward || "共通",
    content: task.content,
    eventType: eventType
  };

  logs.push(logEntry);
  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  console.log("Logged event:", logEntry);
}

export function exportLogs() {
  const logs = localStorage.getItem(LOG_KEY) || "[]";
  const blob = new Blob([logs], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `task_logs_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
