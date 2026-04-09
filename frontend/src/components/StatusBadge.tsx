import type { DealStatus } from '../types';

interface StatusBadgeProps {
  status: DealStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getBadgeClass = (s: DealStatus) => {
    switch (s) {
      case 'AwaitingDeposit': return 'badge-awaiting';
      case 'Funded': return 'badge-funded';
      case 'BuyerConfirmed': return 'badge-buyer-confirmed';
      case 'SellerConfirmed': return 'badge-seller-confirmed';
      case 'Completed': return 'badge-completed';
      case 'Cancelled': return 'badge-cancelled';
      default: return 'badge-awaiting';
    }
  };

  const getIcon = (s: DealStatus) => {
    switch (s) {
      case 'AwaitingDeposit': return 'hourglass_empty';
      case 'Funded': return 'lock';
      case 'BuyerConfirmed': return 'done';
      case 'SellerConfirmed': return 'local_shipping';
      case 'Completed': return 'check_circle';
      case 'Cancelled': return 'cancel';
      default: return 'info';
    }
  };

  const getLabel = (s: DealStatus) => {
    switch (s) {
      case 'AwaitingDeposit': return 'Awaiting Deposit';
      case 'BuyerConfirmed': return 'Buyer Confirmed';
      case 'SellerConfirmed': return 'Seller Confirmed';
      default: return s;
    }
  };

  return (
    <div className={`badge ${getBadgeClass(status)}`}>
      <span className="material-icons-outlined" style={{ fontSize: '14px' }}>
        {getIcon(status)}
      </span>
      {getLabel(status)}
    </div>
  );
}
