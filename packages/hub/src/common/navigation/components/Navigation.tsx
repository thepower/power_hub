import React from 'react';
import { connect, ConnectedProps } from 'react-redux';
import classnames from 'classnames';
import { NavLink } from 'react-router-dom';
import { push } from 'connected-react-router';
import {
  AppBar,
  Drawer,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { NavigationItemType } from '../typings/navigationTypings';
import { navigationItems } from '../utils/navigationUtils';
import styles from './Navigation.module.scss';
import { PowerHubLogoIcon } from '../../icons/PowerHubLogoIcon';
import { ApplicationState } from '../../../application';

const mapStateToProps = (state: ApplicationState) => ({
  currentChain: state.account.subChain,
});

const mapDispatchToProps = {
  changeUrl: push,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type NavigationProps = ConnectedProps<typeof connector>;

type NavigationState = {
  currentItem: string;
  openedTabletMenu: boolean;
};

class NavigationComponent extends React.PureComponent<NavigationProps, NavigationState> {
  drawerClasses = {
    paper: styles.navigation,
  };

  constructor(props: NavigationProps) {
    super(props);

    this.state = {
      currentItem: navigationItems[0].id,
      openedTabletMenu: false,
    };
  }

  getActiveNavigationItemClassName = ({ isActive }: { isActive: boolean }) => {
    return isActive ? styles.activeNavigationLabel : undefined;
  };

  handleNavigateToItem = (navigationItem: NavigationItemType) => () => {
    const { changeUrl } = this.props;
    const { id, url } = navigationItem;
    const { openedTabletMenu } = this.state;

    changeUrl(url);
    this.setCurrentNavigationItem(id);

    if (openedTabletMenu) {
      this.closeTabletMenu();
    }
  };

  setCurrentNavigationItem = (currentItem: string) => {
    this.setState({ currentItem });
  };

  renderNavigationItem = (navigationItem: NavigationItemType) => {
    const { id, label, url } = navigationItem;

    return <ListItem
      key={id}
      className={styles.navigationItem}
      onClick={this.handleNavigateToItem(navigationItem)}
    >
      <NavLink
        to={url}
        className={this.getActiveNavigationItemClassName}
      >
        <ListItemText
          className={styles.navigationLabel}
          primary={label}
        />
      </NavLink>
    </ListItem>;
  };

  openTabletMenu = () => {
    this.setState({ openedTabletMenu: true });
  };

  closeTabletMenu = () => {
    this.setState({ openedTabletMenu: false });
  };

  render() {
    const { openedTabletMenu } = this.state;
    const { currentChain } = this.props;

    return <React.Fragment key={'left'}>
      <AppBar className={styles.appbar} position="fixed">
        <MenuIcon
          onClick={this.openTabletMenu}
          fontSize={'large'}
          className={styles.menuIcon}
        />
        <PowerHubLogoIcon className={styles.appbarIcon}/>
      </AppBar>
      <Drawer
        open
        anchor={'left'}
        variant={openedTabletMenu ? 'temporary' : 'permanent'}
        classes={this.drawerClasses}
        onClose={this.closeTabletMenu}
        className={classnames({[styles.tabletNavigation]: openedTabletMenu})}
      >
        <List>
          {(navigationItems || []).map(this.renderNavigationItem)}
        </List>
        <div className={styles.navigationBottomPart}>
          {
            currentChain &&
            <div>{`Current shard: ${currentChain}`}</div>
          }
          <div>{'Having problems?'}</div>
          <a className={styles.copyrightLink} href={'mailto:support@thepower.io'}>{'Email us'}</a>
          <a className={styles.copyrightLink} href='https://hub.thepower.io/'>
            {'Privacy policy'}
          </a>
          <a className={styles.copyrightLink} href='https://hub.thepower.io/'>
            {'Terms of use'}
          </a>
          <p>&copy; 2018???2022 Power_hub</p>
        </div>
      </Drawer>
      </React.Fragment>
  }
}

export const Navigation = connector(NavigationComponent);
