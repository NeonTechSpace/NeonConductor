import { Button } from '@/web/components/ui/button';

interface ProfileCreateSectionProps {
    value: string;
    isPending: boolean;
    onValueChange: (value: string) => void;
    onCreate: () => void;
}

export function ProfileCreateSection({
    value,
    isPending,
    onValueChange,
    onCreate,
}: ProfileCreateSectionProps) {
    return (
        <section className='space-y-2'>
            <p className='text-sm font-semibold'>Create Profile</p>
            <div className='grid grid-cols-[1fr_auto] gap-2'>
                <label className='sr-only' htmlFor='profile-create-name'>
                    New profile name
                </label>
                <input
                    id='profile-create-name'
                    name='profileCreateName'
                    type='text'
                    value={value}
                    onChange={(event) => {
                        onValueChange(event.target.value);
                    }}
                    className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                    autoComplete='off'
                    placeholder='New profile name…'
                />
                <Button type='button' size='sm' variant='outline' disabled={isPending} onClick={onCreate}>
                    Create
                </Button>
            </div>
        </section>
    );
}
