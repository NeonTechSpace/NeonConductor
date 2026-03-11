import { Outlet } from '@tanstack/react-router';

import TitleBar from '@/web/components/window/titleBar';
import UpdateSwitchModal from '@/web/components/window/updateSwitchModal';

export default function RootLayout() {
    return (
        <div className='flex h-screen min-h-0 min-w-0 flex-col overflow-hidden'>
            <TitleBar />
            <div className='flex min-h-0 min-w-0 flex-1 overflow-hidden'>
                <Outlet />
            </div>
            <UpdateSwitchModal />
        </div>
    );
}
