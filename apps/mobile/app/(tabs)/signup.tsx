import SignupScreen from '../(auth)/signup';

/**
 * Signup rendered inside the tab shell so guests keep the bottom menu
 * (Training / Market / Login) while creating an account. Hidden from the
 * tab bar itself via href: null in the tabs layout.
 */
export default function SignupTab() {
  return <SignupScreen />;
}
