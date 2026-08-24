import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ReturnsHub, { RETURN_SUBPAGE_IDS } from './ReturnsHub';

jest.mock('../global', () => ({
  ModuleHub: ({ defaultModule, onActiveModuleChange }: any) => (
    <div>
      <span data-testid="active-return">{defaultModule}</span>
      <button onClick={() => onActiveModuleChange?.('approval-inbox')}>Choose approvals</button>
      <button onClick={() => onActiveModuleChange?.('resume-post')}>Choose resume</button>
    </div>
  ),
}));
jest.mock('./SalesReturnFlow', () => () => null);
jest.mock('./PurchaseReturnFlow', () => () => null);
jest.mock('./ReturnsListHistory', () => () => null);
jest.mock('./ReturnApprovalInbox', () => () => null);
jest.mock('./ReturnRequesterInbox', () => () => null);

describe('ReturnsHub hash subpage contract', () => {
  it('exposes and resolves the approval and requester-resume destinations', () => {
    expect(RETURN_SUBPAGE_IDS).toContain('approval-inbox');
    expect(RETURN_SUBPAGE_IDS).toContain('resume-post');

    const onSubpageChange = jest.fn();
    const { rerender } = render(
      <ReturnsHub initialSubpage="approval-inbox" onSubpageChange={onSubpageChange} />,
    );
    expect(screen.getByTestId('active-return').textContent).toBe('approval-inbox');
    fireEvent.click(screen.getByRole('button', { name: 'Choose resume' }));
    expect(onSubpageChange).toHaveBeenCalledWith('resume-post');

    rerender(<ReturnsHub initialSubpage="resume-post" onSubpageChange={onSubpageChange} />);
    expect(screen.getByTestId('active-return').textContent).toBe('resume-post');
  });

  it('fails closed to sales return for unsupported legacy subpages', () => {
    render(<ReturnsHub initialSubpage="legacy-return-write" />);
    expect(screen.getByTestId('active-return').textContent).toBe('sales-return');
  });
});
