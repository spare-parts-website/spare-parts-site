import { SessionManagement } from '@/components/session-management'
import { MfaManagement } from '@/components/mfa-management'
export const metadata={title:'أمان الحساب | غيار ماركت'}
export default function AccountSecurityPage(){return <main className="content-container max-w-3xl py-10"><div className="mb-6"><p className="page-kicker">الحساب</p><h1 className="mt-1 text-3xl font-extrabold">أمان الحساب</h1><p className="mt-1 text-muted-foreground">أدر المصادقة متعددة العوامل والجلسات النشطة.</p></div><div className="space-y-6"><MfaManagement/><SessionManagement/></div></main>}
