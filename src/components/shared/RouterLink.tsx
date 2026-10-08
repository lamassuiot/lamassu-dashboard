import React from 'react';
import { Link as ReactRouterLink, type LinkProps } from 'react-router';

type Props = Omit<LinkProps, 'to'> & { href: string };

export default function RouterLink({ href, ...props }: Props) {
  return <ReactRouterLink to={href} {...props} />;
}
