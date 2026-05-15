import { prisma } from './prisma.js'

interface AuditParams {
  userId?:    string
  agentId?:   string
  taskId?:    string
  action:     string
  entityType: string
  payload:    object
}

export function writeAudit(params: AuditParams): void {
  prisma.auditLog.create({ data: params }).catch((err) => {
    console.error('Audit write failed:', err)
  })
}
