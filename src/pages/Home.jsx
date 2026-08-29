import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  return (
    <div className="home-container">
      <header className="hero-section">
        <h1>Decentralized Supply Chain Verification</h1>
        <p>
          Securely track products from manufacturers through distributors and retailers
          to final consumers. Ensuring authenticity, transparency, and trust on the blockchain.
        </p>
      </header>

      <section className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🏭</div>
          <h3>Manufacturers</h3>
          <p>Register new products, issue unique batch tracks, and assign initial dispatch routes.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🚚</div>
          <h3>Distributors</h3>
          <p>Verify product reception and record the logistics transfer onward to retail networks.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🏪</div>
          <h3>Retailers</h3>
          <p>Confirm the final inventory landing point and mark products as sold to end consumers.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🔍</div>
          <h3>Consumers</h3>
          <p>Scan generated QR codes to immediately verify the entire provenance and chain of custody.</p>
        </div>
      </section>

      <div className="cta-container">
        <Link to="/verify" className="cta-button">Verify a Product Now</Link>
      </div>
    </div>
  );
}

export default Home;
