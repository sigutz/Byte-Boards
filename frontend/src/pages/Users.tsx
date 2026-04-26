import type { User } from '../types';

interface Props {
  users: User[];
}

function initials(user: User): string {
  if (user.name) {
    return user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return user.email[0].toUpperCase();
}

export default function Users({ users }: Props) {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', marginBottom: 4 }}>
          REGISTERED USERS
        </div>
        <div style={{ fontSize: 13, color: '#334155' }}>
          {users.length} {users.length === 1 ? 'user' : 'users'}
        </div>
      </div>

      {users.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#243d5a', fontSize: 15 }}>
          No users found.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(user => (
          <div key={user.id} className="fade-up" style={{
            background: '#0d1827', border: '1px solid #1a2e47',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#d97706',
            }}>
              {initials(user)}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                {user.name ?? '—'}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {user.email}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: '#243d5a' }}>
              #{user.id}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
