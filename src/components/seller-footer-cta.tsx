'use client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
export function SellerFooterCta(){const role=useAppStore(state=>state.user?.role);return <Button asChild variant="secondary" className="mt-5"><Link href={role==='SHOP_OWNER'?'/seller/parts':'/register'} prefetch={false}>{role==='SHOP_OWNER'?'فتح صفحة المحل':'انضم كبائع'}</Link></Button>}
