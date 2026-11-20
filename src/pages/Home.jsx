import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import ProvenanceDiagram from '../components/ProvenanceDiagram';
import { STAGES } from '../lib/stages';
import './Home.css';

function Home() {
  const [productId, setProductId] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const id = productId.trim();
    // Hand off to the verify route rather than duplicating lookup logic here.
    navigate(id ? `/verify/${encodeURIComponent(id)}` : '/verify');
  };

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-inner">
          <h1>Know exactly where it came from.</h1>
          <p className="hero-lede">
            Every product is registered by its manufacturer and signed at each change of hands.
            Scan the code and read the whole chain yourself &mdash; no account, no wallet, no asking
            the brand to vouch for itself.
          </p>

          <div className="hero-actions">
            <Link to="/verify" className="btn btn-primary">
              Verify a product
              <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
            </Link>
            <Link to="/registry" className="btn btn-secondary">
              Browse the registry
            </Link>
          </div>

          <form className="hero-search" onSubmit={handleSubmit}>
            <label htmlFor="hero-pid" className="field-label">
              Check a code now
            </label>
            <div className="hero-search-row">
              <input
                id="hero-pid"
                type="text"
                className="input input-mono hero-input"
                placeholder="MED-2026-001"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              />
              <button type="submit" className="btn btn-primary hero-submit">
                Verify
              </button>
            </div>
            <p className="field-hint">
              Reading the chain is free and needs no wallet. Only registering and transferring
              costs gas.
            </p>
          </form>
        </div>

        <div className="hero-diagram">
          <ProvenanceDiagram />
        </div>
      </section>

      <section className="section section-sunken">
        <div className="section-inner">
          <h2>One record, four signatures</h2>
          <p className="section-lede">
            A product moves forward through four stages and never backwards. Each step is signed by
            the party taking custody.
          </p>

          <div className="pipeline">
            {STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              return (
                <div
                  key={stage.contractName}
                  className="pipeline-step"
                  style={{ '--stage': stage.color, '--stage-rgb': stage.rgb }}
                >
                  <div className="pipeline-head">
                    <span className="pipeline-icon">
                      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <span className="mono pipeline-index">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3>{stage.label}</h3>
                  <p>{stage.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-inner proof">
          <div className="proof-copy">
            <h2>What a check actually proves</h2>
            <p>
              A match tells you a real manufacturer registered this ID and that nobody has edited
              the record since. That is a strong signal, and it is not the same as proof that the
              box in your hand is the one described.
            </p>
            <p>
              Printed codes can be photographed and reprinted. So instead of pretending otherwise,
              we count how often each code is checked and flag the patterns a copied label
              produces.
            </p>
          </div>

          <div className="proof-list">
            <div className="proof-item">
              <Check size={19} strokeWidth={2.4} aria-hidden="true" className="proof-yes" />
              <div>
                <h3>A record exists and is unaltered</h3>
                <p>Registered by an authorised manufacturer, signed at every handover.</p>
              </div>
            </div>
            <div className="proof-item">
              <Check size={19} strokeWidth={2.4} aria-hidden="true" className="proof-yes" />
              <div>
                <h3>The full chain of custody</h3>
                <p>Every address that held it, in order, with timestamps.</p>
              </div>
            </div>
            <div className="proof-item proof-caveat">
              <TriangleAlert size={19} strokeWidth={2.2} aria-hidden="true" />
              <div>
                <h3>Not proof the object is genuine</h3>
                <p>A copied label reads identically. Check the scan count and the packaging too.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
