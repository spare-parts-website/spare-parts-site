import { SessionManagement } from '@/components/session-management'
export const metadata={title:'أمان الحساب | غيار ماركت'}
export default function AccountSecurityPage(){return <main className="content-container max-w-3xl py-10"><div className="mb-6"><p className="page-kicker">الحساب</p><h1 className="mt-1 text-3xl font-extrabold">أمان الحساب</h1><p className="mt-1 text-muted-foreground">راجع الجلسات النشطة وألغِ أي جهاز لا تعرفه.</p></div><SessionManagement/></main>}
