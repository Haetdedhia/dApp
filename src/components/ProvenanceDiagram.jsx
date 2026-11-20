import { STAGES } from '../lib/stages';
import './ProvenanceDiagram.css';

/**
 * ProvenanceDiagram - hand-built SVG of a product moving through custody.
 *
 * Drawn from the real data model rather than borrowed illustration: four nodes
 * in the lifecycle colours, joined by a path, with a signature mark on each
 * handover. It is the one decorative-ish element in the product, and it earns
 * its place by diagramming exactly what the contract enforces — forward only,
 * signed at every step.
 *
 * viewBox-driven so it scales crisply at any width. Marked role="img" with a
 * single label, because the node text is already in the DOM for sighted users
 * and reading each coordinate aloud would be noise.
 */
function ProvenanceDiagram() {
  const nodes = STAGES.map((stage, idx) => ({
    ...stage,
    x: 70 + idx * 180,
    y: idx % 2 === 0 ? 92 : 58
  }));

  const path = nodes
    .map((node, idx) => (idx === 0 ? `M ${node.x} ${node.y}` : `L ${node.x} ${node.y}`))
    .join(' ');

  return (
    <div className="provenance-diagram">
      <svg
        viewBox="0 0 640 170"
        role="img"
        aria-label="A product moving through four signed custody stages: manufactured, distributor received, retailer received, sold."
      >
        <path d={path} className="pd-track" />
        <path d={path} className="pd-trail" />

        {nodes.map((node, idx) => (
          <g key={node.contractName}>
            <circle cx={node.x} cy={node.y} r="19" fill={node.color} opacity="0.12" />
            <circle
              cx={node.x}
              cy={node.y}
              r="19"
              fill="none"
              stroke={node.color}
              strokeWidth="1.5"
              className="pd-node"
              style={{ '--i': idx }}
            />
            <circle cx={node.x} cy={node.y} r="5" fill={node.color} className="pd-core" style={{ '--i': idx }} />
            <text
              x={node.x}
              y={node.y + 40}
              textAnchor="middle"
              className="pd-label"
              fill={node.color}
            >
              {node.shortLabel}
            </text>
            <text x={node.x} y={node.y - 29} textAnchor="middle" className="pd-index">
              {String(idx + 1).padStart(2, '0')}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default ProvenanceDiagram;
