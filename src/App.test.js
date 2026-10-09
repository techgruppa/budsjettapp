import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock("./supabaseClient", () => ({
  supabase: null,
  supabaseConfigError: ""
}));

test('renders budget app', () => {
  const { container } = render(<App />);
  const element = screen.getByText(/Sett totalbudsjett:/i);
  expect(element).toBeInTheDocument();
  expect(screen.getByText(/Versjon 0\.1\.0/i)).toBeInTheDocument();
  expect(screen.getByText(/Local-only mode/i)).toBeInTheDocument();
  expect(
    Array.from(container.querySelectorAll(".adjust input")).map((input) => input.value)
  ).toEqual(["0", "0", "0", "0"]);
});
