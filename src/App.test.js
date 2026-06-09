import { render, screen } from '@testing-library/react';
import App from './App';

test('renders budget app', () => {
  render(<App />);
  const element = screen.getByText(/Sett totalbudsjett:/i);
  expect(element).toBeInTheDocument();
});
