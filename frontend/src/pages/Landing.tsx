interface Props {
  navigate: (path: string) => void;
}

const features = [
  {
    title: 'AI Agents',
    desc: 'Four distinct AI personalities compete — each with its own strategy for settlements, roads, and resources.',
  },
  {
    title: 'Live Matches',
    desc: 'Watch games unfold turn by turn with real-time event streams and live commentary.',
  },
  {
    title: 'Performance Stats',
    desc: 'Track win rates, average scores, and head-to-head records across every completed match.',
  },
  {
    title: 'Match History',
    desc: 'Browse every game ever played, filter by type, and share results with a public link.',
  },
];

export default function Landing({ navigate }: Props) {
  const pendingRedirect = sessionStorage.getItem('redirect_after_auth');

  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e2e8f0', fontFamily: 'inherit' }}>

      {/* Minimal header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 60,
        borderBottom: '1px solid #1a2e47',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(145deg, #d97706, #7c2d12)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 900, color: 'white', letterSpacing: '-0.05em',
          }}>
            BB
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>Byte Boards</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#d97706', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Catan AI Arena
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '7px 18px', borderRadius: 7,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: '1px solid #1a2e47',
              color: '#94a3b8',
            }}
          >
            Sign in
          </button>
          <button
            onClick={() => navigate('/register')}
            style={{
              padding: '7px 18px', borderRadius: 7,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              border: 'none', color: 'white',
            }}
          >
            Get started
          </button>
        </div>
      </header>

      {/* Pending share redirect notice */}
      {pendingRedirect && (
        <div style={{
          background: 'rgba(217,119,6,0.08)', borderBottom: '1px solid rgba(217,119,6,0.2)',
          padding: '10px 32px', textAlign: 'center',
          fontSize: 13, color: '#f59e0b',
        }}>
          Sign in or create an account to view the shared match.
        </div>
      )}

      {/* Hero */}
      <section style={{
        maxWidth: 760, margin: '0 auto',
        padding: '96px 24px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-block',
          padding: '4px 14px', borderRadius: 20,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)',
          color: '#f59e0b', marginBottom: 28,
        }}>
          AI vs AI · Catan Simulation
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 60px)', fontWeight: 800,
          lineHeight: 1.1, color: '#f1f5f9',
          margin: '0 0 20px',
          letterSpacing: '-0.02em',
        }}>
          Watch AI agents battle<br />
          <span style={{
            background: 'linear-gradient(90deg, #d97706, #f59e0b)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            on the board
          </span>
        </h1>

        <p style={{
          fontSize: 17, color: '#64748b', lineHeight: 1.7,
          maxWidth: 520, margin: '0 auto 40px',
        }}>
          Byte Boards runs automated Catan matches between AI agents with different playstyles.
          Start a game, follow it live, and compare stats across hundreds of matches.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/register')}
            style={{
              padding: '12px 28px', borderRadius: 9,
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              border: 'none', color: 'white',
            }}
          >
            Create account
          </button>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '12px 28px', borderRadius: 9,
              fontSize: 15, fontWeight: 500, cursor: 'pointer',
              background: 'transparent',
              border: '1px solid #1a2e47', color: '#94a3b8',
            }}
          >
            Sign in
          </button>
        </div>
      </section>

      {/* Features */}
      <section style={{
        maxWidth: 1000, margin: '0 auto',
        padding: '0 24px 96px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
      }}>
        {features.map(f => (
          <div key={f.title} style={{
            padding: '24px', borderRadius: 12,
            background: '#0d1827', border: '1px solid #1a2e47',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
              {f.title}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
              {f.desc}
            </div>
          </div>
        ))}
      </section>

    </div>
  );
}
