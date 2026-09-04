import { execSync } from 'node:child_process'
import path from 'node:path'

export default async function globalSetup(): Promise<void> {
  const serverDir = path.resolve(process.cwd(), '../server')
  execSync('npm run prisma:seed', { cwd: serverDir, stdio: 'inherit' })
}
