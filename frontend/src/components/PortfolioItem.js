// frontend/src/components/PortfolioItem.js
import React from 'react';

function PortfolioItem({ item, onRemove }) {
  return (
    <li>
      {item.symbol} ({item.type}) - Qty: {item.quantity}, Original Cost: ${Number(item.original_cost).toFixed(2)}, 
      Current Price: ${item.current_price?.toFixed(2) || 'Loading...'}, 
      Current Value: ${item.current_value?.toFixed(2) || 'Loading...'}, 
      P/L: ${item.profit_loss?.toFixed(2) || 'Loading...'}
      <button onClick={() => onRemove(item.id)}>Remove</button>
    </li>
  );
}

export default PortfolioItem;