// src/components/PhoneFrame.jsx
function PhoneFrame({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1a1a2e', // dark desktop background
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      {/* Phone shell */}
      <div style={{
        position: 'relative',
        width: '393px',
        height: '852px', // iPhone 14 Pro dimensions
        backgroundColor: '#1c1c1e',
        borderRadius: '54px',
        boxShadow: `
          0 0 0 2px #3a3a3c,
          0 0 0 4px #1c1c1e,
          0 0 0 6px #3a3a3c,
          0 40px 80px rgba(0,0,0,0.6)
        `,
        padding: '12px',
      }}>
        {/* Side buttons */}
        <div style={{ position: 'absolute', left: '-3px', top: '160px', width: '3px', height: '36px', backgroundColor: '#3a3a3c', borderRadius: '2px 0 0 2px' }} /> {/* mute */}
        <div style={{ position: 'absolute', left: '-3px', top: '210px', width: '3px', height: '64px', backgroundColor: '#3a3a3c', borderRadius: '2px 0 0 2px' }} /> {/* vol up */}
        <div style={{ position: 'absolute', left: '-3px', top: '284px', width: '3px', height: '64px', backgroundColor: '#3a3a3c', borderRadius: '2px 0 0 2px' }} /> {/* vol down */}
        <div style={{ position: 'absolute', right: '-3px', top: '220px', width: '3px', height: '80px', backgroundColor: '#3a3a3c', borderRadius: '0 2px 2px 0' }} /> {/* power */}

        {/* Screen */}
        <div style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#fff',
          borderRadius: '44px',
          overflow: 'hidden',
          position: 'relative',
        }}>
          

          {/* App content — flex column so nav stays pinned at bottom */}
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PhoneFrame