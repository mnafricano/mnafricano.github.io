<?php
require_once( dirname(__FILE__).'/form.lib.php' );

define( 'PHPFMG_USER', "mnafricano@gmail.com" ); // must be a email address. for sending password to you.
define( 'PHPFMG_PW', "eac8aa" );

?>
<?php
/**
 * GNU Library or Lesser General Public License version 2.0 (LGPLv2)
*/

# main
# ------------------------------------------------------
error_reporting( E_ERROR ) ;
phpfmg_admin_main();
# ------------------------------------------------------




function phpfmg_admin_main(){
    $mod  = isset($_REQUEST['mod'])  ? $_REQUEST['mod']  : '';
    $func = isset($_REQUEST['func']) ? $_REQUEST['func'] : '';
    $function = "phpfmg_{$mod}_{$func}";
    if( !function_exists($function) ){
        phpfmg_admin_default();
        exit;
    };

    // no login required modules
    $public_modules   = false !== strpos('|captcha|', "|{$mod}|", "|ajax|");
    $public_functions = false !== strpos('|phpfmg_ajax_submit||phpfmg_mail_request_password||phpfmg_filman_download||phpfmg_image_processing||phpfmg_dd_lookup|', "|{$function}|") ;   
    if( $public_modules || $public_functions ) { 
        $function();
        exit;
    };
    
    return phpfmg_user_isLogin() ? $function() : phpfmg_admin_default();
}

function phpfmg_ajax_submit(){
    $phpfmg_send = phpfmg_sendmail( $GLOBALS['form_mail'] );
    $isHideForm  = isset($phpfmg_send['isHideForm']) ? $phpfmg_send['isHideForm'] : false;

    $response = array(
        'ok' => $isHideForm,
        'error_fields' => isset($phpfmg_send['error']) ? $phpfmg_send['error']['fields'] : '',
        'OneEntry' => isset($GLOBALS['OneEntry']) ? $GLOBALS['OneEntry'] : '',
    );
    
    @header("Content-Type:text/html; charset=$charset");
    echo "<html><body><script>
    var response = " . json_encode( $response ) . ";
    try{
        parent.fmgHandler.onResponse( response );
    }catch(E){};
    \n\n";
    echo "\n\n</script></body></html>";

}


function phpfmg_admin_default(){
    if( phpfmg_user_login() ){
        phpfmg_admin_panel();
    };
}



function phpfmg_admin_panel()
{    
    phpfmg_admin_header();
    phpfmg_writable_check();
?>    
<table cellpadding="0" cellspacing="0" border="0">
	<tr>
		<td valign=top style="padding-left:280px;">

<style type="text/css">
    .fmg_title{
        font-size: 16px;
        font-weight: bold;
        padding: 10px;
    }
    
    .fmg_sep{
        width:32px;
    }
    
    .fmg_text{
        line-height: 150%;
        vertical-align: top;
        padding-left:28px;
    }

</style>

<script type="text/javascript">
    function deleteAll(n){
        if( confirm("Are you sure you want to delete?" ) ){
            location.href = "admin.php?mod=log&func=delete&file=" + n ;
        };
        return false ;
    }
</script>


<div class="fmg_title">
    1. Email Traffics
</div>
<div class="fmg_text">
    <a href="admin.php?mod=log&func=view&file=1">view</a> &nbsp;&nbsp;
    <a href="admin.php?mod=log&func=download&file=1">download</a> &nbsp;&nbsp;
    <?php 
        if( file_exists(PHPFMG_EMAILS_LOGFILE) ){
            echo '<a href="#" onclick="return deleteAll(1);">delete all</a>';
        };
    ?>
</div>


<div class="fmg_title">
    2. Form Data
</div>
<div class="fmg_text">
    <a href="admin.php?mod=log&func=view&file=2">view</a> &nbsp;&nbsp;
    <a href="admin.php?mod=log&func=download&file=2">download</a> &nbsp;&nbsp;
    <?php 
        if( file_exists(PHPFMG_SAVE_FILE) ){
            echo '<a href="#" onclick="return deleteAll(2);">delete all</a>';
        };
    ?>
</div>

<div class="fmg_title">
    3. Form Generator
</div>
<div class="fmg_text">
    <a href="http://www.formmail-maker.com/generator.php" onclick="document.frmFormMail.submit(); return false;" title="<?php echo htmlspecialchars(PHPFMG_SUBJECT);?>">Edit Form</a> &nbsp;&nbsp;
    <a href="http://www.formmail-maker.com/generator.php" >New Form</a>
</div>
    <form name="frmFormMail" action='http://www.formmail-maker.com/generator.php' method='post' enctype='multipart/form-data'>
    <input type="hidden" name="uuid" value="<?php echo PHPFMG_ID; ?>">
    <input type="hidden" name="external_ini" value="<?php echo function_exists('phpfmg_formini') ?  phpfmg_formini() : ""; ?>">
    </form>

		</td>
	</tr>
</table>

<?php
    phpfmg_admin_footer();
}



function phpfmg_admin_header( $title = '' ){
    header( "Content-Type: text/html; charset=" . PHPFMG_CHARSET );
?>
<html>
<head>
    <title><?php echo '' == $title ? '' : $title . ' | ' ; ?>PHP FormMail Admin Panel </title>
    <meta name="keywords" content="PHP FormMail Generator, PHP HTML form, send html email with attachment, PHP web form,  Free Form, Form Builder, Form Creator, phpFormMailGen, Customized Web Forms, phpFormMailGenerator,formmail.php, formmail.pl, formMail Generator, ASP Formmail, ASP form, PHP Form, Generator, phpFormGen, phpFormGenerator, anti-spam, web hosting">
    <meta name="description" content="PHP formMail Generator - A tool to ceate ready-to-use web forms in a flash. Validating form with CAPTCHA security image, send html email with attachments, send auto response email copy, log email traffics, save and download form data in Excel. ">
    <meta name="generator" content="PHP Mail Form Generator, phpfmg.sourceforge.net">

    <style type='text/css'>
    body, td, label, div, span{
        font-family : Verdana, Arial, Helvetica, sans-serif;
        font-size : 12px;
    }
    </style>
</head>
<body  marginheight="0" marginwidth="0" leftmargin="0" topmargin="0">

<table cellspacing=0 cellpadding=0 border=0 width="100%">
    <td nowrap align=center style="background-color:#024e7b;padding:10px;font-size:18px;color:#ffffff;font-weight:bold;width:250px;" >
        Form Admin Panel
    </td>
    <td style="padding-left:30px;background-color:#86BC1B;width:100%;font-weight:bold;" >
        &nbsp;
<?php
    if( phpfmg_user_isLogin() ){
        echo '<a href="admin.php" style="color:#ffffff;">Main Menu</a> &nbsp;&nbsp;' ;
        echo '<a href="admin.php?mod=user&func=logout" style="color:#ffffff;">Logout</a>' ;
    }; 
?>
    </td>
</table>

<div style="padding-top:28px;">

<?php
    
}


function phpfmg_admin_footer(){
?>

</div>

<div style="color:#cccccc;text-decoration:none;padding:18px;font-weight:bold;">
	:: <a href="http://phpfmg.sourceforge.net" target="_blank" title="Free Mailform Maker: Create read-to-use Web Forms in a flash. Including validating form with CAPTCHA security image, send html email with attachments, send auto response email copy, log email traffics, save and download form data in Excel. " style="color:#cccccc;font-weight:bold;text-decoration:none;">PHP FormMail Generator</a> ::
</div>

</body>
</html>
<?php
}


function phpfmg_image_processing(){
    $img = new phpfmgImage();
    $img->out_processing_gif();
}


# phpfmg module : captcha
# ------------------------------------------------------
function phpfmg_captcha_get(){
    $img = new phpfmgImage();
    $img->out();
    //$_SESSION[PHPFMG_ID.'fmgCaptchCode'] = $img->text ;
    $_SESSION[ phpfmg_captcha_name() ] = $img->text ;
}



function phpfmg_captcha_generate_images(){
    for( $i = 0; $i < 50; $i ++ ){
        $file = "$i.png";
        $img = new phpfmgImage();
        $img->out($file);
        $data = base64_encode( file_get_contents($file) );
        echo "'{$img->text}' => '{$data}',\n" ;
        unlink( $file );
    };
}


function phpfmg_dd_lookup(){
    $paraOk = ( isset($_REQUEST['n']) && isset($_REQUEST['lookup']) && isset($_REQUEST['field_name']) );
    if( !$paraOk )
        return;
        
    $base64 = phpfmg_dependent_dropdown_data();
    $data = @unserialize( base64_decode($base64) );
    if( !is_array($data) ){
        return ;
    };
    
    
    foreach( $data as $field ){
        if( $field['name'] == $_REQUEST['field_name'] ){
            $nColumn = intval($_REQUEST['n']);
            $lookup  = $_REQUEST['lookup']; // $lookup is an array
            $dd      = new DependantDropdown(); 
            echo $dd->lookupFieldColumn( $field, $nColumn, $lookup );
            return;
        };
    };
    
    return;
}


function phpfmg_filman_download(){
    if( !isset($_REQUEST['filelink']) )
        return ;
        
    $info =  @unserialize(base64_decode($_REQUEST['filelink']));
    if( !isset($info['recordID']) ){
        return ;
    };
    
    $file = PHPFMG_SAVE_ATTACHMENTS_DIR . $info['recordID'] . '-' . $info['filename'];
    phpfmg_util_download( $file, $info['filename'] );
}


class phpfmgDataManager
{
    var $dataFile = '';
    var $columns = '';
    var $records = '';
    
    function phpfmgDataManager(){
        $this->dataFile = PHPFMG_SAVE_FILE; 
    }
    
    function parseFile(){
        $fp = @fopen($this->dataFile, 'rb');
        if( !$fp ) return false;
        
        $i = 0 ;
        $phpExitLine = 1; // first line is php code
        $colsLine = 2 ; // second line is column headers
        $this->columns = array();
        $this->records = array();
        $sep = chr(0x09);
        while( !feof($fp) ) { 
            $line = fgets($fp);
            $line = trim($line);
            if( empty($line) ) continue;
            $line = $this->line2display($line);
            $i ++ ;
            switch( $i ){
                case $phpExitLine:
                    continue;
                    break;
                case $colsLine :
                    $this->columns = explode($sep,$line);
                    break;
                default:
                    $this->records[] = explode( $sep, phpfmg_data2record( $line, false ) );
            };
        }; 
        fclose ($fp);
    }
    
    function displayRecords(){
        $this->parseFile();
        echo "<table border=1 style='width=95%;border-collapse: collapse;border-color:#cccccc;' >";
        echo "<tr><td>&nbsp;</td><td><b>" . join( "</b></td><td>&nbsp;<b>", $this->columns ) . "</b></td></tr>\n";
        $i = 1;
        foreach( $this->records as $r ){
            echo "<tr><td align=right>{$i}&nbsp;</td><td>" . join( "</td><td>&nbsp;", $r ) . "</td></tr>\n";
            $i++;
        };
        echo "</table>\n";
    }
    
    function line2display( $line ){
        $line = str_replace( array('"' . chr(0x09) . '"', '""'),  array(chr(0x09),'"'),  $line );
        $line = substr( $line, 1, -1 ); // chop first " and last "
        return $line;
    }
    
}
# end of class



# ------------------------------------------------------
class phpfmgImage
{
    var $im = null;
    var $width = 73 ;
    var $height = 33 ;
    var $text = '' ; 
    var $line_distance = 8;
    var $text_len = 4 ;

    function phpfmgImage( $text = '', $len = 4 ){
        $this->text_len = $len ;
        $this->text = '' == $text ? $this->uniqid( $this->text_len ) : $text ;
        $this->text = strtoupper( substr( $this->text, 0, $this->text_len ) );
    }
    
    function create(){
        $this->im = imagecreate( $this->width, $this->height );
        $bgcolor   = imagecolorallocate($this->im, 255, 255, 255);
        $textcolor = imagecolorallocate($this->im, 0, 0, 0);
        $this->drawLines();
        imagestring($this->im, 5, 20, 9, $this->text, $textcolor);
    }
    
    function drawLines(){
        $linecolor = imagecolorallocate($this->im, 210, 210, 210);
    
        //vertical lines
        for($x = 0; $x < $this->width; $x += $this->line_distance) {
          imageline($this->im, $x, 0, $x, $this->height, $linecolor);
        };
    
        //horizontal lines
        for($y = 0; $y < $this->height; $y += $this->line_distance) {
          imageline($this->im, 0, $y, $this->width, $y, $linecolor);
        };
    }
    
    function out( $filename = '' ){
        if( function_exists('imageline') ){
            $this->create();
            if( '' == $filename ) header("Content-type: image/png");
            ( '' == $filename ) ? imagepng( $this->im ) : imagepng( $this->im, $filename );
            imagedestroy( $this->im ); 
        }else{
            $this->out_predefined_image(); 
        };
    }

    function uniqid( $len = 0 ){
        $md5 = md5( uniqid(rand()) );
        return $len > 0 ? substr($md5,0,$len) : $md5 ;
    }
    
    function out_predefined_image(){
        header("Content-type: image/png");
        $data = $this->getImage(); 
        echo base64_decode($data);
    }
    
    // Use predefined captcha random images if web server doens't have GD graphics library installed  
    function getImage(){
        $images = array(
			'5DCF' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAX0lEQVR4nGNYhQEaGAYTpIn7QkNEQxhCHUNDkMQCGkRaGR0CHRhQxRpdGwRRxAIDQGKMMDGwk8KmTVuZumplaBay+1pR1OEUC2jFtENkCqZbWAPAbkY1b4DCj4oQi/sAhs7Kl9xdQ1IAAAAASUVORK5CYII=',
			'41A3' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaklEQVR4nGNYhQEaGAYTpI37pjAEAHGoA7JYCGMAQyijQwCSGGMIawCjo0ODCJIYK1Ava0NAQwCS+6ZNWxW1FIiykNwXgKoODENDgWKhASjmMUDVYYoForiFYQprKFAdqpsHKvyoB7G4DwBjRcsZNyRBkAAAAABJRU5ErkJggg==',
			'A068' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaUlEQVR4nGNYhQEaGAYTpIn7GB0YAhhCGaY6IImxBjCGMDo6BAQgiYlMYW1lbXB0EEESC2gVaXRtYICpAzspaum0lalTV03NQnIfWB2aeaGhIL2BaOaB7EAXw3RLQCummwcq/KgIsbgPABNBzGvZLLjXAAAAAElFTkSuQmCC',
			'52EE' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZElEQVR4nGNYhQEaGAYTpIn7QkMYQ1hDHUMDkMQCGlhbWRsYHRhQxEQaXdHEAgMYkMXATgqbtmrp0tCVoVnI7mtlmIJuHlAsAMOOVkYHdDERoE50MdYA0VBXNDcPVPhREWJxHwDs5clh4Y9lHQAAAABJRU5ErkJggg==',
			'6DE0' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAX0lEQVR4nGNYhQEaGAYTpIn7WANEQ1hDHVqRxUSmiLSyNjBMdUASC2gRaXRtYAgIQBZrAIkxOogguS8yatrK1NCVWdOQ3BcyBUUdRG8rLjFUO7C5BZubByr8qAixuA8A5A7MxxJHfPAAAAAASUVORK5CYII=',
			'2CC1' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAY0lEQVR4nGNYhQEaGAYTpIn7WAMYQxlCHVqRxUSmsDY6OgRMRRYLaBVpcG0QCEXRDRRjBZIo7ps2bdXSVSCE5L4AFHVgyOiAKcbaALYD1S0NYLegiIWGgt0cGjAIwo+KEIv7APp1zAyIgU5HAAAAAElFTkSuQmCC',
			'F462' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAb0lEQVR4nM2QoRGAMAxFU5ENyj6pqI8gptMEkQ3oCDWdEnBNQcId+eLfPfPfBfrtFP6UT/xEwECg0sBYoYZEzJ4JaqLoWMh4dhz8pLTWau9l8GONhok2v7FIVjbwG4bK+8wul5mBBFl/8L8X8+B3AGXTzTf0bAV0AAAAAElFTkSuQmCC',
			'5CF7' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaUlEQVR4nGNYhQEaGAYTpIn7QkMYQ1lDA0NDkMQCGlgbXYG0CIqYSAO6WGCASAMrWA7hvrBp01YtDV21MgvZfa1gda0oNkPEpiCLBbSC7QhAFhOZAnILowOyGGsA0M1oYgMVflSEWNwHAGlDy+/tCNeQAAAAAElFTkSuQmCC',
			'C277' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbUlEQVR4nGNYhQEaGAYTpIn7WEMYQ1hDA0NDkMREWllbGRoCGkSQxAIaRRod0MUaGBodwKII90WtWrUUCFdmIbkPKD8FCFsZUPUGAOEUFLFGRgdGB6AoqlsaWBuAoihuFg11RRMbqPCjIsTiPgDa8MwwIhetjAAAAABJRU5ErkJggg==',
			'7AFA' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYklEQVR4nGNYhQEaGAYTpIn7QkMZAlhDA1pRRFsZQ1gbGKY6oIixtgLFAgKQxaaINLo2MDqIILsvatrK1NCVWdOQ3AdUgawODFkbREOBYqEhSGIiDZjqAogUG6jwoyLE4j4A5THLVP+0V4EAAAAASUVORK5CYII=',
			'143B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaUlEQVR4nGNYhQEaGAYTpIn7GB0YWhlDGUMdkMRYHRimsjY6OgQgiYk6MIQyNAQ6iKDoZXRlQKgDO2ll1tKlq6auDM1Cch+jg0grA5p5jA6iQDvRzWNoxbSDoRXDLSGYbh6o8KMixOI+AArryPjNe38VAAAAAElFTkSuQmCC',
			'F121' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYklEQVR4nGNYhQEaGAYTpIn7QkMZAhhCGVqRxQIaGAMYHR2mooqxBrA2BISiigH1NgTA9IKdFBq1KmrVyqylyO4Dq2tFtwMoNgWLWACmGKMDuhhrKGtoQGjAIAg/KkIs7gMAH+zKkSpFzlcAAAAASUVORK5CYII=',
			'A058' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAc0lEQVR4nGNYhQEaGAYTpIn7GB0YAlhDHaY6IImxBjCGsDYwBAQgiYlMYW1lBaoWQRILaBVpdJ0KVwd2UtTSaStTM7OmZiG5D6TOoSEAxbzQUJBYIJp5IDvQxRhDGB0dUPQGtDIEMIQyoLh5oMKPihCL+wAPvsxhMfJUgwAAAABJRU5ErkJggg==',
			'4819' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcUlEQVR4nM2QsQ2AMAwE7SIbZCCzQQonBdMkBRs42YFMCbhAjqAEgb87/UsnQ79chj/lHT9BBoFKlrFbgCEEw5B9mRjJG+Zk78nJVKm1NfXW52T8gvag2m2MvpBA9oOLMhqZbgeXwxkjjc5f/e+53Pht0lvLXWuQKs0AAAAASUVORK5CYII=',
			'B771' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZUlEQVR4nGNYhQEaGAYTpIn7QgNEQ11DA1qRxQKmMDQ6NARMRRFrBYuFoqkDicL0gp0UGrVq2qqlQIjkPqC6AAaQWhTzGB2AomhirA1AUTS3iDSwNqCKhQaAxUIDBkH4URFicR8Ae9PNsRshNakAAAAASUVORK5CYII=',
			'E612' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbElEQVR4nM2Quw2AMAxEzwUbhH3CBi5sikzjFNkgZIhMScp8KEHC1z2drSejLmP4Uz7xUyFBxuU7xrYlCJgH5iIJeTcya7vmOj8N5ayl1tD5se2p9aKf7vmMhJVlzC4ZPDuTHio/+N+LefC7Afr0zOqnoK5IAAAAAElFTkSuQmCC',
			'9E09' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaUlEQVR4nGNYhQEaGAYTpIn7WANEQxmmMEx1QBITmSLSwBDKEBCAJBbQKtLA6OjoIIImxtoQCBMDO2na1KlhS1dFRYUhuY/VFaQuYCqyXgaw3oAGZDEBsB0OKHZgcws2Nw9U+FERYnEfAN0WyxzC9Mx/AAAAAElFTkSuQmCC',
			'096D' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaElEQVR4nGNYhQEaGAYTpIn7GB0YQxhCGUMdkMRYA1hbGR0dHQKQxESmiDS6Njg6iCCJBbSCxBhhYmAnRS1dujR16sqsaUjuC2hlDHR1RNfLANQbiCImMoUFQwybW7C5eaDCj4oQi/sAcAvK0Wktr9kAAAAASUVORK5CYII=',
			'BD24' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZklEQVR4nGNYhQEaGAYTpIn7QgNEQxhCGRoCkMQCpoi0Mjo6NKKItYo0ugJJNHWNDkAyAMl9oVHTVmatzIqKQnIfWF0rowO6eQ5TGEND0MUCsLjFAVUM5GbW0AAUsYEKPypCLO4DALpKz8UYazo7AAAAAElFTkSuQmCC',
			'4E14' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaElEQVR4nGNYhQEaGAYTpI37poiGMkxhaAhAFgsRAWKGRmQxRqAYYwhDK7IY6xSguikMUwKQ3Ddt2tSwVdNWRUUhuS8ArI7RAVlvaChYLDQExS1g81DdglVMNJQx1AFVbKDCj3oQi/sAmrbMvLJhrM4AAAAASUVORK5CYII=',
			'3473' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAc0lEQVR4nM3QsQ2AMAwEwE/BBsk+buhNkYYRmMIU3iCMkIJMSURlC0oQ+LtPZJ2MdhnBn/KKLzF0yJzJdFywQSZi+1OR+4tE25UwYiVh49vnWlvPYn0lKgrE70uZGH6fQgP5rlt0kOAsp1ngzF/d78Hc+A6XyMxSYiPKjwAAAABJRU5ErkJggg==',
			'7DFC' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYUlEQVR4nGNYhQEaGAYTpIn7QkNFQ1hDA6YGIIu2irSyNjAEiKCKNbo2MDqwIItNgYihuC9q2srU0JVZyO5jdEBRB4asDZhiIg2YdgQ0YLoloAHo5gYGVDcPUPhREWJxHwDQ4sslMh9ZMQAAAABJRU5ErkJggg==',
			'1EBD' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAWElEQVR4nGNYhQEaGAYTpIn7GB1EQ1lDGUMdkMRYHUQaWBsdHQKQxERBYg2BQBJZL0SdCJL7VmZNDVsaujJrGpL70NQhxLCZh8MOFLeEYLp5oMKPihCL+wCbrciXJ7mKFAAAAABJRU5ErkJggg==',
			'1073' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcklEQVR4nGNYhQEaGAYTpIn7GB0YAlhDA0IdkMRYHRhDGBoCHQKQxEQdWFsZGgIaRFD0ijQ6NDo0BCC5b2XWtJVZS1ctzUJyH1jdFIaGAHS9AQxo5rG2At2DJsYYwgokUdwSAnRzAwOKmwcq/KgIsbgPAEUOya0+q2HDAAAAAElFTkSuQmCC',
			'439B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAa0lEQVR4nGNYhQEaGAYTpI37prCGMIQyhjogi4WItDI6OjoEIIkxhjA0ujYEOoggibFOYWhlBYoFILlv2rRVYSszI0OzkNwXAFTHEBKIYl5oKEOjA5p5DFMYGh0xxDDdgtXNAxV+1INY3AcAhvfK/u0j3yUAAAAASUVORK5CYII=',
			'7999' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbklEQVR4nGNYhQEaGAYTpIn7QkMZQxhCGaY6IIu2srYyOjoEBKCIiTS6NgQ6iCCLTUERg7gpaunSzMyoqDAk9zE6MAY6hARMRdbL2sDQ6NAQ0IAsJtLA0ujYEIBiR0ADplsCGrC4eYDCj4oQi/sAvhPL+fIRJdsAAAAASUVORK5CYII=',
			'EFEB' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAATUlEQVR4nGNYhQEaGAYTpIn7QkNEQ11DHUMdkMQCGkQaWBsYHQKwiIngVgd2UmjU1LCloStDs5DcR6p5eOyAuhkohubmgQo/KkIs7gMAzNXL2UVo758AAAAASUVORK5CYII=',
			'9A0E' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbElEQVR4nGNYhQEaGAYTpIn7WAMYAhimMIYGIImJTGEMYQhldEBWF9DK2sro6IgmJtLo2hAIEwM7adrUaStTV0WGZiG5j9UVRR0EtoqGoosJAM1zRLNDZIpIowOaW1gDgGJobh6o8KMixOI+AJDVyk5sbsIpAAAAAElFTkSuQmCC',
			'1FA1' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAXUlEQVR4nGNYhQEaGAYTpIn7GB1EQx2mMLQii7E6iDQwhDJMRRYTBYoxOjqEouoVaWBtCIDpBTtpZdbUsKWropYiuw9NHUIsFIsYNnVoYqIhYLHQgEEQflSEWNwHABEoyf89Fer1AAAAAElFTkSuQmCC',
			'C8A0' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcElEQVR4nGNYhQEaGAYTpIn7WEMYQximMLQii4m0srYyhDJMdUASC2gUaXR0dAgIQBZrYG1lbQh0EEFyX9SqlWFLV0VmTUNyH5o6qJhIo2somhjQDteGABQ7QG5hbQhAcQvIzUAxFDcPVPhREWJxHwBoes1u2iQizgAAAABJRU5ErkJggg==',
			'1388' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAW0lEQVR4nGNYhQEaGAYTpIn7GB1YQxhCGaY6IImxOoi0Mjo6BAQgiYk6MDS6NgQ6iKDoZUBWB3bSyqxVYatCV03NQnIfmjqYGDbzsIhhcUsIppsHKvyoCLG4DwA26ska/wxUEAAAAABJRU5ErkJggg==',
			'1741' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZklEQVR4nGNYhQEaGAYTpIn7GB1EQx0aHVqRxVgdGIAiDlORxURBYlMdQlH1MrQyBML1gp20MmvVtJWZWUuR3QdUF8CKZgejA6MDa2gAmhhrAwOGOhEMMdEQsFhowCAIPypCLO4DALUkyi1frEfWAAAAAElFTkSuQmCC',
			'8641' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZElEQVR4nGNYhQEaGAYTpIn7WAMYQxgaHVqRxUSmsLYytDpMRRYLaBVpZJjqEIqqTqSBIRCuF+ykpVHTwlZmZi1Fdp/IFNFWVjQ7QOa5hgZgiDlgcwuaGNTNoQGDIPyoCLG4DwBWL81BdP2gsAAAAABJRU5ErkJggg==',
			'B388' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAV0lEQVR4nGNYhQEaGAYTpIn7QgNYQxhCGaY6IIkFTBFpZXR0CAhAFmtlaHRtCHQQQVHHgKwO7KTQqFVhq0JXTc1Cch+aOtzmYbUD0y3Y3DxQ4UdFiMV9AM5WzYbF7kBEAAAAAElFTkSuQmCC',
			'CAD4' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbklEQVR4nGNYhQEaGAYTpIn7WEMYAlhDGRoCkMREWhlDWBsdGpHFAhpZW1kbAlpRxBpEGl0bAqYEILkvatW0lamroqKikNwHURfogKpXNBQoFhqCYgfYPDS3AMUaHVDEWEOAYmhuHqjwoyLE4j4AoF7QEdLBsqIAAAAASUVORK5CYII=',
			'6E6C' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZUlEQVR4nGNYhQEaGAYTpIn7WANEQxlCGaYGIImJTBFpYHR0CBBBEgtoEWlgbXB0YEEWawCJMToguy8yamrY0qkrs5DdFwI0j9XR0QHZ3oBWkN5ArGLIdmBzCzY3D1T4URFicR8Amo3K9+aXvmgAAAAASUVORK5CYII=',
			'3EE3' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAVklEQVR4nGNYhQEaGAYTpIn7RANEQ1lDHUIdkMQCpog0sDYwOgQgq2wFiTE0iCCLTYGIBSC5b2XU1LCloauWZiG7D1UdbvOwiGFzCzY3D1T4URFicR8AbDfLlF3f6JAAAAAASUVORK5CYII=',
			'8E9B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYUlEQVR4nGNYhQEaGAYTpIn7WANEQxlCGUMdkMREpog0MDo6OgQgiQW0ijSwNgQ6iKCpA4kFILlvadTUsJWZkaFZSO4DqWMICcQwjwHNPJAYIxY70N2Czc0DFX5UhFjcBwDGHssUNMpKnQAAAABJRU5ErkJggg==',
			'0797' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAd0lEQVR4nGNYhQEaGAYTpIn7GB1EQx1CGUNDkMRYAxgaHR0dGkSQxESmMDS6NgSgiAW0MrSyAsUCkNwXtXTVtJWZUSuzkNwHVBfAEAIkUfQyOgDJKQwodrA2MDYEBDCguEWkgRHoGFQ3A10RyogiNlDhR0WIxX0AS5DLHXcHMIMAAAAASUVORK5CYII=',
			'333B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAWUlEQVR4nGNYhQEaGAYTpIn7RANYQxhDGUMdkMQCpoi0sjY6OgQgq2xlaHRoCHQQQRabAhKFqwM7aWXUqrBVU1eGZiG7D1UdbvOwiGFzCzY3D1T4URFicR8A9jLMCPIxpDEAAAAASUVORK5CYII=',
			'6167' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcElEQVR4nGNYhQEaGAYTpIn7WAMYAhhCGUNDkMREpjAGMDo6NIggiQW0sAawNqCJNTAAxcA03H2RUauilk5dtTILyX0hU4DqHB1ake0NaAXpDZiCRSyAAcUtDEC3ODqgupk1FOhmFLGBCj8qQizuAwBdnMm+u87oegAAAABJRU5ErkJggg==',
			'7C74' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAb0lEQVR4nM3QsRGAIAyFYVKwAQPFwj6FaZgmKdiAcwObTGnKgJZ6yuu+g7v/SHY5kv60V/qYgTOTUNSWFYV0tCJubbBeJCl2in11Nzus1tAH6Pc6YHybxY2At2DFt2AaWkiyrjKbN0/21f89uJu+EwyLzlmEsOJMAAAAAElFTkSuQmCC',
			'F412' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAa0lEQVR4nGNYhQEaGAYTpIn7QkMZWhmmMEx1QBILaGCYyhDCEBCAKhbKGMLoIIIixugK1NsgguS+0KilS1dNW7UqCsl9AQ0iIDsaUe0QDXWYArQb1Q6QuilYxALQxRhDHUNDBkH4URFicR8Az2nMzH6IC3cAAAAASUVORK5CYII=',
			'7DB2' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAa0lEQVR4nGNYhQEaGAYTpIn7QkNFQ1hDGaY6IIu2irSyNjoEBKCKNbo2BDqIIItNAYo1OjSIILsvatrK1FAgheQ+RgewukZkO1gbQOYFtCK7RQQiNgVZLKAB4hZUMZCbGUNDBkH4URFicR8AOdnN4tgcOz0AAAAASUVORK5CYII=',
			'4B3C' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAY0lEQVR4nGNYhQEaGAYTpI37poiGMIYyTA1AFgsRaWVtdAgQQRJjDBFpdGgIdGBBEmOdItLK0OjogOy+adOmhq2aujIL2X0BqOrAMDQUYh6qWzDtAIphuAWrmwcq/KgHsbgPABRCzDyKtkRGAAAAAElFTkSuQmCC',
			'07DE' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaklEQVR4nGNYhQEaGAYTpIn7GB1EQ11DGUMDkMRYAxgaXRsdHZDViUwBijUEoogFtDK0siLEwE6KWrpq2tJVkaFZSO4DqgtgxdDL6IAuJjKFtQFdjDVApIEVzS2MDkAxNDcPVPhREWJxHwAHNspXl5XWOwAAAABJRU5ErkJggg==',
			'836F' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAXUlEQVR4nGNYhQEaGAYTpIn7WANYQxhCGUNDkMREpoi0Mjo6OiCrC2hlaHRtQBUTmcLQytrACBMDO2lp1KqwpVNXhmYhuQ+sDqt5gQTFsLkF6mYUsYEKPypCLO4DADasycD1TxqIAAAAAElFTkSuQmCC',
			'6AE1' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZUlEQVR4nGNYhQEaGAYTpIn7WAMYAlhDHVqRxUSmMIawNjBMRRYLaGFtBYqFoog1iDS6NjDA9IKdFBk1bWVq6KqlyO4LmYKiDqK3VTQUUwxTnQgWvawBQLFQh9CAQRB+VIRY3AcAUKbMphdo6lYAAAAASUVORK5CYII=',
			'7CA8' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcUlEQVR4nGNYhQEaGAYTpIn7QkMZQxmmMEx1QBZtZW10CGUICEARE2lwdHR0EEEWmyLSwNoQAFMHcVPUtFVLV0VNzUJyH6MDijowZG0AioUGopgnAoSuDahiAQ2sja5oegMaGEOB5qG6eYDCj4oQi/sAahXNfHZZmt4AAAAASUVORK5CYII=',
			'2C3B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYklEQVR4nGNYhQEaGAYTpIn7WAMYQ0HQAUlMZApro2ujo0MAklhAq0iDQ0OggwiybqAYA0IdxE3Tpq1aNXVlaBay+wJQ1IEhI9gkVPNYGzDtEGnAdEtoKKabByr8qAixuA8AXarMUgiXlTEAAAAASUVORK5CYII=',
			'DA03' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaElEQVR4nGNYhQEaGAYTpIn7QgMYAhimMIQ6IIkFTGEMYQhldAhAFmtlbWV0dGgQQRETaXRtCGgIQHJf1NJpK1OBZBaS+9DUQcVEQ0Fi6OY5otsxRaTRAc0toQFAMTQ3D1T4URFicR8Anr3PO2LxZFsAAAAASUVORK5CYII=',
			'38EC' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAWUlEQVR4nGNYhQEaGAYTpIn7RAMYQ1hDHaYGIIkFTGFtZW1gCBBBVtkq0ujawOjAgiwGVsfogOy+lVErw5aGrsxCcR+qOhTzsIkh24HNLdjcPFDhR0WIxX0A2OPKVJno1AsAAAAASUVORK5CYII=',
			'62A8' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAeElEQVR4nGNYhQEaGAYTpIn7WAMYQximMEx1QBITmcLayhDKEBCAJBbQItLo6OjoIIIs1sDQ6NoQAFMHdlJk1KqlS1dFTc1Ccl/IFIYprAh1EL2tDAGsoYGo5rUyOrA2oIoB3dKArpc1QDQUaC+Kmwcq/KgIsbgPAGGxzVXchATxAAAAAElFTkSuQmCC',
			'ED58' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZUlEQVR4nGNYhQEaGAYTpIn7QkNEQ1hDHaY6IIkFNIi0sjYwBASgijW6NjA6iKCLTYWrAzspNGraytTMrKlZSO4DqXNoCMAwz6EhENM8TLFWRkcHFL0gNzOEMqC4eaDCj4oQi/sA2O3OUiWloksAAAAASUVORK5CYII=',
			'6D0E' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAX0lEQVR4nGNYhQEaGAYTpIn7WANEQximMIYGIImJTBFpZQhldEBWF9Ai0ujo6Igq1iDS6NoQCBMDOykyatrK1FWRoVlI7guZgqIOorcVuxi6Hdjcgs3NAxV+VIRY3AcA39LLKXCTJskAAAAASUVORK5CYII=',
			'AD6B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZUlEQVR4nGNYhQEaGAYTpIn7GB1EQxhCGUMdkMRYA0RaGR0dHQKQxESmiDS6Njg6iCCJBbSCxBhh6sBOilo6bWXq1JWhWUjuA6tDMy80FKQ3EIt5GGIYbgloxXTzQIUfFSEW9wEAff/MwDBJWd8AAAAASUVORK5CYII=',
			'E10C' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAXElEQVR4nGNYhQEaGAYTpIn7QkMYAhimMEwNQBILaGAMYAhlCBBBEWMNYHR0dGBBEWMIYG0IdEB2X2jUqqilqyKzkN2Hpg6vGDY70N0SGsIaiu7mgQo/KkIs7gMANUnJ0Oqu2wUAAAAASUVORK5CYII=',
			'E3B2' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYUlEQVR4nGNYhQEaGAYTpIn7QkNYQ1hDGaY6IIkFNIi0sjY6BASgiDE0ujYEOoigioHUNYgguS80alXY0tBVq6KQ3AdV1+iAYV5AKwOm2BQGLG7BdDNjaMggCD8qQizuAwDgqc5Sb71lXwAAAABJRU5ErkJggg==',
			'0DD6' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAXUlEQVR4nGNYhQEaGAYTpIn7GB1EQ1hDGaY6IImxBoi0sjY6BAQgiYlMEWl0bQh0EEASC2iFiCG7L2rptJWpqyJTs5DcB1WHYh5MrwgWO0QIuAWbmwcq/KgIsbgPAD2xzRg1acsiAAAAAElFTkSuQmCC',
			'BE58' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZ0lEQVR4nGNYhQEaGAYTpIn7QgNEQ1lDHaY6IIkFTBFpYG1gCAhAFmsFiTE6iKCrmwpXB3ZSaNTUsKWZWVOzkNwHUgckMcxjaAhENQ9sRyCGHYyODih6QW5mCGVAcfNAhR8VIRb3AQCPvc1Iand/vQAAAABJRU5ErkJggg==',
			'8CB6' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYElEQVR4nGNYhQEaGAYTpIn7WAMYQ1lDGaY6IImJTGFtdG10CAhAEgtoFWlwbQh0EEBRJ9LA2ujogOy+pVHTVi0NXZmaheQ+qDoM81iB5olgsUOEgFuwuXmgwo+KEIv7ALHbzXNw9nzzAAAAAElFTkSuQmCC',
			'30F6' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYklEQVR4nGNYhQEaGAYTpIn7RAMYAlhDA6Y6IIkFTGEMYW1gCAhAVtnK2srawOgggCw2RaTRFSiG7L6VUdNWpoauTM1Cdh9EHZp5EL0iWOwQIeAWsJsbGFDcPFDhR0WIxX0AFCHKflGXGIIAAAAASUVORK5CYII=',
			'6858' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAc0lEQVR4nGNYhQEaGAYTpIn7WAMYQ1hDHaY6IImJTGFtZW1gCAhAEgtoEWl0bWB0EEEWawCqmwpXB3ZSZNTKsKWZWVOzkNwXAjQPqBrVvFaRRoeGQFTzWkF2oIqB3MLo6ICiF+RmhlAGFDcPVPhREWJxHwC4fMyo7V5dVgAAAABJRU5ErkJggg==',
			'6C3A' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbUlEQVR4nGNYhQEaGAYTpIn7WAMYQxlDGVqRxUSmsDa6NjpMdUASC2gRaXBoCAgIQBZrEGlgaHR0EEFyX2TUtFWrpq7MmobkvpApKOogeltBvMDQEDQxh4ZAFHUQt6DqhbiZEUVsoMKPihCL+wDpKM1pXfcB2AAAAABJRU5ErkJggg==',
			'50F4' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbUlEQVR4nGNYhQEaGAYTpIn7QkMYAlhDAxoCkMQCGhhDWBsYGlHFWFuBYq3IYoEBIo2uDQxTApDcFzZt2srU0FVRUcjuawWpY3RA1gsVCw1BtqMVbAeKW0SmgN2CIsYaAHQzmthAhR8VIRb3AQBuhM0IhqdT7AAAAABJRU5ErkJggg==',
			'3A2B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAdElEQVR4nGNYhQEaGAYTpIn7RAMYAhhCGUMdkMQCpjCGMDo6OgQgq2xlbWVtCHQQQRabItLoABQLQHLfyqhpK7NWZoZmIbsPpK6VEc080VCHKYyo5rUC1QWgigUA9To6oOoVDRBpdA0NRHHzQIUfFSEW9wEA1XrLUhpiNLgAAAAASUVORK5CYII=',
			'7A35' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAdUlEQVR4nGNYhQEaGAYTpIn7QkMZAhhDGUMDkEVbGUNYGx0dUFS2srYyNASiik0RaXRodHR1QHZf1LSVWVNXRkUhuY/RAaTOoUEESS9rg2ioQ0MAiphIA1Ad0A5kMaCKRtdGh4AANDHHUIapDoMg/KgIsbgPAHKUzPghWhubAAAAAElFTkSuQmCC',
			'21DF' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZElEQVR4nGNYhQEaGAYTpIn7WAMYAlhDGUNDkMREpjAGsDY6OiCrC2hlDWBtCEQRY2hlQBaDuGnaqqilqyJDs5DdF8CAoZfRAVOMtQFTTAQkhuaW0FBWIGREdcsAhR8VIRb3AQCcO8ec+Afd8AAAAABJRU5ErkJggg==',
			'8029' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcUlEQVR4nGNYhQEaGAYTpIn7WAMYAhhCGaY6IImJTGEMYXR0CAhAEgtoZW1lbQh0EEFRJ9LogBADO2lp1LSVWSuzosKQ3AdW18owVQTFPKDYFKAcmh1A16DZAXSLAwOKW0BuZg0NQHHzQIUfFSEW9wEAF93LUXJygX4AAAAASUVORK5CYII=',
			'2F27' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcUlEQVR4nM2QwQ2AIAwA6YMN6j51g5pYh2CKftgA3QGmtPxK9KlR7sWFNhdCuxwNf+KVvsiTkICszmFBhZkUneOMGpUHF3K/seH6jn1rNdXk+9jeZcPNApkrhm/p29nwLQYQkHci1iLL4L76vwe56TsBoCHKmKHuPfgAAAAASUVORK5CYII=',
			'D532' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbElEQVR4nGNYhQEaGAYTpIn7QgNEQxlDGaY6IIkFTBFpYG10CAhAFmsVAZKBDiKoYiEMjQ4NIkjui1o6demqqUAayX0BrUBVIIiiF6QTSKKaBxKbgiI2hbUV5BZUNzOGMAJdHTIIwo+KEIv7AAHIzzjptJP1AAAAAElFTkSuQmCC',
			'3E10' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZElEQVR4nGNYhQEaGAYTpIn7RANEQxmmMLQiiwVMEWlgCGGY6oCsslWkgTGEISAAWQykbgqjgwiS+1ZGTQ1bNW1l1jRk96Gqg5uHXQzVDrBbpqC6BeRmxlAHFDcPVPhREWJxHwCI6cr1MR0DNwAAAABJRU5ErkJggg==',
			'83A1' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYElEQVR4nGNYhQEaGAYTpIn7WANYQximMLQii4lMEWllCGWYiiwW0MrQ6OjoEIqqjqGVFSSD5L6lUavClq6KWorsPjR1cPNcQ7GIoakDuQVdL8jNQLHQgEEQflSEWNwHAP6YzSdLnEP9AAAAAElFTkSuQmCC',
			'8C04' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYklEQVR4nGNYhQEaGAYTpIn7WAMYQxmmMDQEIImJTGFtdAhlaEQWC2gVaXB0dGhFVSfSwNoQMCUAyX1Lo6atWroqKioKyX0QdYEO6OYBxUJDMO3A5hYUMWxuHqjwoyLE4j4AN/rOpoeQHOUAAAAASUVORK5CYII=',
			'8602' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbElEQVR4nGNYhQEaGAYTpIn7WAMYQximMEx1QBITmcLayhDKEBCAJBbQKtLI6OjoIIKiTqSBtSGgQQTJfUujpoUtXRUFhAj3iUwRbQWqa3RAM88VSDKgiQGtmMKAxS2YbmYMDRkE4UdFiMV9AF+ezF7kDmZTAAAAAElFTkSuQmCC',
			'FAD2' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZElEQVR4nGNYhQEaGAYTpIn7QkMZAlhDGaY6IIkFNDCGsDY6BASgiLG2sjYEOoigiIk0uoJIJPeFRk1bmboqCggR7oOqa0S1QzQUKNbKgGneFAwxoFswxEIZQ0MGQfhREWJxHwDgA89thmg+PwAAAABJRU5ErkJggg==',
			'521E' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAbElEQVR4nGNYhQEaGAYTpIn7QkMYQximMIYGIIkFNLC2MoQwOjCgiIk0OqKJBQYwNDpMgYuBnRQ2bdXSVdNWhmYhu6+VYQrDFFS9QLEAdLGAViAfTUxkCmsDuhhrgGioIxAiu3mgwo+KEIv7AAAMyYecPQFzAAAAAElFTkSuQmCC',
			'2634' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcElEQVR4nM3QwQ2AIAxA0XJgA9ynblAT8MA07aEbIEMwpcFTCR41SpMeftLkBWjTY/jTvOLz5KJLwGRaKF69oNhGGqRv20ADg2Ah66t1b0fL2fpoUZAV7a3DIMhbitbCvdFo4csytJRm81f/9+Dc+E520M4ZgSAIkAAAAABJRU5ErkJggg==',
			'0781' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcElEQVR4nGNYhQEaGAYTpIn7GB1EQx1CGVqRxVgDGBodHR2mIouJTGFodG0ICEUWC2hlaGV0dIDpBTspaumqaatCVy1Fdh9QXQCSOqgYowMrSAbFDtYGdDHWAJEGdL2MDiINDKEMoQGDIPyoCLG4DwAdxctK7u6ZBgAAAABJRU5ErkJggg==',
			'35BE' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZUlEQVR4nGNYhQEaGAYTpIn7RANEQ1lDGUMDkMQCpog0sDY6OqCobAWKNQSiik0RCUFSB3bSyqipS5eGrgzNQnbfFIZGVwzzgGLo5rWKYIgFTGFtRXeLaABjCLqbByr8qAixuA8AVpbKwc7IRxMAAAAASUVORK5CYII=',
			'7EC0' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAX0lEQVR4nGNYhQEaGAYTpIn7QkNFQxlCHVpRRFtFGhgdAqY6oImxNggEBCCLTQGJMTqIILsvamrY0lUrs6YhuQ+kAkkdGLI2YIqJNGDaEdCA6ZaABixuHqDwoyLE4j4A8r7LTEwwhm4AAAAASUVORK5CYII=',
			'5CAB' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcElEQVR4nGNYhQEaGAYTpIn7QkMYQxmmMIY6IIkFNLA2OoQyOgSgiIk0ODo6OoggiQUGiDSwNgTC1IGdFDZt2qqlqyJDs5Dd14qiDiEWGohiXgBQzLUBVUxkCmujK5pe1gDGUKB5KG4eqPCjIsTiPgACXcztvTxCGgAAAABJRU5ErkJggg==',
			'CD9A' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAa0lEQVR4nGNYhQEaGAYTpIn7WENEQxhCGVqRxURaRVoZHR2mOiCJBTSKNLo2BAQEIIs1gMQCHUSQ3Be1atrKzMzIrGlI7gOpcwiBq0OINQSGhqDZ4diAqg7iFkcUMYibGVHEBir8qAixuA8AHqjMxuADEkQAAAAASUVORK5CYII=',
			'B626' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAb0lEQVR4nGNYhQEaGAYTpIn7QgMYQxhCGaY6IIkFTGFtZXR0CAhAFmsVaWRtCHQQQFEnAiQDHZDdFxo1LWzVyszULCT3BUwRbWVoZcQwz2EKo4MIulgAmhjILQ4MKHpBbmYNDUBx80CFHxUhFvcBAJwozIx9iNMMAAAAAElFTkSuQmCC',
			'6B28' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAc0lEQVR4nGNYhQEaGAYTpIn7WANEQxhCGaY6IImJTBFpZXR0CAhAEgtoEWl0bQh0EEEWaxBpBZIwdWAnRUZNDVu1MmtqFpL7QoDmMbQyoJrXKtLoMIUR1TyQWACqGNgtDqh6QW5mDQ1AcfNAhR8VIRb3AQCjUsyDZNLQ6wAAAABJRU5ErkJggg==',
			'B4FD' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZklEQVR4nGNYhQEaGAYTpIn7QgMYWllDA0MdkMQCpjBMZW1gdAhAFmtlCAWJiaCoY3RFEgM7KTRq6dKloSuzpiG5L2CKSCuG3lbRUFcMMQZMdVMgYshuAbu5gRHFzQMVflSEWNwHAGnHy5AEDpygAAAAAElFTkSuQmCC',
			'64EE' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAX0lEQVR4nGNYhQEaGAYTpIn7WAMYWllDHUMDkMREpjBMZW1gdEBWF9DCEIoh1sDoiiQGdlJk1NKlS0NXhmYhuS9kikgrht5W0VBXDDEGDHVAt2CIYXPzQIUfFSEW9wEAgdfJSxp2AhYAAAAASUVORK5CYII=',
			'923B' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcElEQVR4nGNYhQEaGAYTpIn7WAMYQxhDGUMdkMREprC2sjY6OgQgiQW0ijQ6NAQ6iKCIMTQ6INSBnTRt6qqlq6auDM1Cch+rK8MUBjTzGFoZAhjQzBNoZXRAFwO6pQHdLawBoqGOaG4eqPCjIsTiPgDnF8vWnxd6iwAAAABJRU5ErkJggg==',
			'C5C3' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAa0lEQVR4nGNYhQEaGAYTpIn7WENEQxlCHUIdkMREWkUaGB0CHQKQxAIaRRpYGwQaRJDFGkRCWME0wn1Rq6YuXbpq1dIsJPcB5RtdEepQxERQ7QCKodoh0sraiu4W1hDGEHQ3D1T4URFicR8ApNvNZGq8k2AAAAAASUVORK5CYII=',
			'DCC6' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAXElEQVR4nGNYhQEaGAYTpIn7QgMYQxlCHaY6IIkFTGFtdHQICAhAFmsVaXBtEHQQQBNjbWB0QHZf1NJpq5auWpmaheQ+qDoM80B6RbDYIULALdjcPFDhR0WIxX0AZXbN9PNJV00AAAAASUVORK5CYII=',
			'49C5' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAb0lEQVR4nGNYhQEaGAYTpI37pjCGMIQ6hgYgi4WwtjI6BDogq2MMEWl0bRBEEWOdAhJjdHVAct+0aUuXpq5aGRWF5L6AKYyBrkBaBElvaChDI7oYwxQWsB2oYiC3BASguA/sZoepDoMh/KgHsbgPAPL9y3KfOqFWAAAAAElFTkSuQmCC',
			'622D' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAeElEQVR4nGNYhQEaGAYTpIn7WAMYQxhCGUMdkMREprC2Mjo6OgQgiQW0iDS6NgQ6iCCLNTA0OiDEwE6KjFq1dNXKzKxpSO4LmcIwhaGVEVVvK0MAwxR0MUYHhgBUMaBbGhgdGFHcwhogGuoaGoji5oEKPypCLO4DAJCPysn06NOzAAAAAElFTkSuQmCC',
			'CE17' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZElEQVR4nGNYhQEaGAYTpIn7WENEQxmmMIaGIImJtIo0MIQAaSSxgEaRBkZ0MRBvCohGuC9q1dSwVdNWrcxCch9UXSsDpt4pDGh2AEUCGNDdMoXRAd3NjKGOKGIDFX5UhFjcBwBLIstRRM49ywAAAABJRU5ErkJggg==',
			'A530' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcklEQVR4nGNYhQEaGAYTpIn7GB1EQxlDGVqRxVgDRBpYGx2mOiCJiUwRAZIBAQFIYgGtIiEMjY4OIkjui1o6demqqSuzpiG5L6CVodEBoQ4MQ0OBYg2BKGJA84Bi6HawtqK7JaCVMQTdzQMVflSEWNwHAMMOzcq9m8v9AAAAAElFTkSuQmCC',
			'F882' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAYUlEQVR4nGNYhQEaGAYTpIn7QkMZQxhCGaY6IIkFNLC2Mjo6BASgiIk0ujYEOohgqmsQQXJfaNTKsFWhq1ZFIbkPqq7RAcO8gFYGTLEpDFjcgioGcjNjaMggCD8qQizuAwDMU82EZfa5hwAAAABJRU5ErkJggg==',
			'88CF' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAXUlEQVR4nGNYhQEaGAYTpIn7WAMYQxhCHUNDkMREprC2MjoEOiCrC2gVaXRtEEQRA6ljbWCEiYGdtDRqZdjSVStDs5Dch6YOyTxsYph2oLsF6mYUsYEKPypCLO4DAFf2ydFxWjYDAAAAAElFTkSuQmCC',
			'C71F' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaUlEQVR4nGNYhQEaGAYTpIn7WENEQx2mMIaGIImJtDI0OoQwOiCrC2hkaHREF2tgaGWYAhcDOylq1appq6atDM1Cch9QXQCSOqgYkI8u1sjagC4m0iqCIcYaItLAGOqIIjZQ4UdFiMV9ABRfyYXfXBByAAAAAElFTkSuQmCC',
			'AC16' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAcElEQVR4nGNYhQEaGAYTpIn7GB0YQxmmMEx1QBJjDWBtdAhhCAhAEhOZItLgGMLoIIAkFtAq0sAwhdEB2X1RS6etWjVtZWoWkvug6lDMCw2F6BVBM88BQwzolimobgloZQxlDHVAcfNAhR8VIRb3AQD/A8xtJUIxSAAAAABJRU5ErkJggg==',
			'D2CF' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAaklEQVR4nGNYhQEaGAYTpIn7QgMYQxhCHUNDkMQCprC2MjoEOiCrC2gVaXRtEEQTYwCKMcLEwE6KWrpq6dJVK0OzkNwHVDeFFaEOJhaAKcbowIpuB1gnqltCA0RDHUIdUcQGKvyoCLG4DwACh8sLnWLG/gAAAABJRU5ErkJggg==',
			'F468' => 'iVBORw0KGgoAAAANSUhEUgAAAEkAAAAhAgMAAADoum54AAAACVBMVEX///8AAADS0tIrj1xmAAAAZklEQVR4nGNYhQEaGAYTpIn7QkMZWhlCGaY6IIkFNDBMZXR0CAhAFQtlbXB0EEERY3RlbWCAqQM7KTRq6dKlU1dNzUJyX0CDSCsrhnmioa4NgWjmMbSyYhHD4hYMNw9U+FERYnEfAEMuzSnZ0na4AAAAAElFTkSuQmCC'        
        );
        $this->text = array_rand( $images );
        return $images[ $this->text ] ;    
    }
    
    function out_processing_gif(){
        $image = dirname(__FILE__) . '/processing.gif';
        $base64_image = "R0lGODlhFAAUALMIAPh2AP+TMsZiALlcAKNOAOp4ANVqAP+PFv///wAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFCgAIACwAAAAAFAAUAAAEUxDJSau9iBDMtebTMEjehgTBJYqkiaLWOlZvGs8WDO6UIPCHw8TnAwWDEuKPcxQml0Ynj2cwYACAS7VqwWItWyuiUJB4s2AxmWxGg9bl6YQtl0cAACH5BAUKAAgALAEAAQASABIAAAROEMkpx6A4W5upENUmEQT2feFIltMJYivbvhnZ3Z1h4FMQIDodz+cL7nDEn5CH8DGZhcLtcMBEoxkqlXKVIgAAibbK9YLBYvLtHH5K0J0IACH5BAUKAAgALAEAAQASABIAAAROEMkphaA4W5upMdUmDQP2feFIltMJYivbvhnZ3V1R4BNBIDodz+cL7nDEn5CH8DGZAMAtEMBEoxkqlXKVIg4HibbK9YLBYvLtHH5K0J0IACH5BAUKAAgALAEAAQASABIAAAROEMkpjaE4W5tpKdUmCQL2feFIltMJYivbvhnZ3R0A4NMwIDodz+cL7nDEn5CH8DGZh8ONQMBEoxkqlXKVIgIBibbK9YLBYvLtHH5K0J0IACH5BAUKAAgALAEAAQASABIAAAROEMkpS6E4W5spANUmGQb2feFIltMJYivbvhnZ3d1x4JMgIDodz+cL7nDEn5CH8DGZgcBtMMBEoxkqlXKVIggEibbK9YLBYvLtHH5K0J0IACH5BAUKAAgALAEAAQASABIAAAROEMkpAaA4W5vpOdUmFQX2feFIltMJYivbvhnZ3V0Q4JNhIDodz+cL7nDEn5CH8DGZBMJNIMBEoxkqlXKVIgYDibbK9YLBYvLtHH5K0J0IACH5BAUKAAgALAEAAQASABIAAAROEMkpz6E4W5tpCNUmAQD2feFIltMJYivbvhnZ3R1B4FNRIDodz+cL7nDEn5CH8DGZg8HNYMBEoxkqlXKVIgQCibbK9YLBYvLtHH5K0J0IACH5BAkKAAgALAEAAQASABIAAAROEMkpQ6A4W5spIdUmHQf2feFIltMJYivbvhnZ3d0w4BMAIDodz+cL7nDEn5CH8DGZAsGtUMBEoxkqlXKVIgwGibbK9YLBYvLtHH5K0J0IADs=";
        $binary = is_file($image) ? join("",file($image)) : base64_decode($base64_image); 
        header("Cache-Control: post-check=0, pre-check=0, max-age=0, no-store, no-cache, must-revalidate");
        header("Pragma: no-cache");
        header("Content-type: image/gif");
        echo $binary;
    }

}
# end of class phpfmgImage
# ------------------------------------------------------
# end of module : captcha


# module user
# ------------------------------------------------------
function phpfmg_user_isLogin(){
    return ( isset($_SESSION['authenticated']) && true === $_SESSION['authenticated'] );
}


function phpfmg_user_logout(){
    session_destroy();
    header("Location: admin.php");
}

function phpfmg_user_login()
{
    if( phpfmg_user_isLogin() ){
        return true ;
    };
    
    $sErr = "" ;
    if( 'Y' == $_POST['formmail_submit'] ){
        if(
            defined( 'PHPFMG_USER' ) && strtolower(PHPFMG_USER) == strtolower($_POST['Username']) &&
            defined( 'PHPFMG_PW' )   && strtolower(PHPFMG_PW) == strtolower($_POST['Password']) 
        ){
             $_SESSION['authenticated'] = true ;
             return true ;
             
        }else{
            $sErr = 'Login failed. Please try again.';
        }
    };
    
    // show login form 
    phpfmg_admin_header();
?>
<form name="frmFormMail" action="" method='post' enctype='multipart/form-data'>
<input type='hidden' name='formmail_submit' value='Y'>
<br><br><br>

<center>
<div style="width:380px;height:260px;">
<fieldset style="padding:18px;" >
<table cellspacing='3' cellpadding='3' border='0' >
	<tr>
		<td class="form_field" valign='top' align='right'>Email :</td>
		<td class="form_text">
            <input type="text" name="Username"  value="<?php echo $_POST['Username']; ?>" class='text_box' >
		</td>
	</tr>

	<tr>
		<td class="form_field" valign='top' align='right'>Password :</td>
		<td class="form_text">
            <input type="password" name="Password"  value="" class='text_box'>
		</td>
	</tr>

	<tr><td colspan=3 align='center'>
        <input type='submit' value='Login'><br><br>
        <?php if( $sErr ) echo "<span style='color:red;font-weight:bold;'>{$sErr}</span><br><br>\n"; ?>
        <a href="admin.php?mod=mail&func=request_password">I forgot my password</a>   
    </td></tr>
</table>
</fieldset>
</div>
<script type="text/javascript">
    document.frmFormMail.Username.focus();
</script>
</form>
<?php
    phpfmg_admin_footer();
}


function phpfmg_mail_request_password(){
    $sErr = '';
    if( $_POST['formmail_submit'] == 'Y' ){
        if( strtoupper(trim($_POST['Username'])) == strtoupper(trim(PHPFMG_USER)) ){
            phpfmg_mail_password();
            exit;
        }else{
            $sErr = "Failed to verify your email.";
        };
    };
    
    $n1 = strpos(PHPFMG_USER,'@');
    $n2 = strrpos(PHPFMG_USER,'.');
    $email = substr(PHPFMG_USER,0,1) . str_repeat('*',$n1-1) . 
            '@' . substr(PHPFMG_USER,$n1+1,1) . str_repeat('*',$n2-$n1-2) . 
            '.' . substr(PHPFMG_USER,$n2+1,1) . str_repeat('*',strlen(PHPFMG_USER)-$n2-2) ;


    phpfmg_admin_header("Request Password of Email Form Admin Panel");
?>
<form name="frmRequestPassword" action="admin.php?mod=mail&func=request_password" method='post' enctype='multipart/form-data'>
<input type='hidden' name='formmail_submit' value='Y'>
<br><br><br>

<center>
<div style="width:580px;height:260px;text-align:left;">
<fieldset style="padding:18px;" >
<legend>Request Password</legend>
Enter Email Address <b><?php echo strtoupper($email) ;?></b>:<br />
<input type="text" name="Username"  value="<?php echo $_POST['Username']; ?>" style="width:380px;">
<input type='submit' value='Verify'><br>
The password will be sent to this email address. 
<?php if( $sErr ) echo "<br /><br /><span style='color:red;font-weight:bold;'>{$sErr}</span><br><br>\n"; ?>
</fieldset>
</div>
<script type="text/javascript">
    document.frmRequestPassword.Username.focus();
</script>
</form>
<?php
    phpfmg_admin_footer();    
}


function phpfmg_mail_password(){
    phpfmg_admin_header();
    if( defined( 'PHPFMG_USER' ) && defined( 'PHPFMG_PW' ) ){
        $body = "Here is the password for your form admin panel:\n\nUsername: " . PHPFMG_USER . "\nPassword: " . PHPFMG_PW . "\n\n" ;
        if( 'html' == PHPFMG_MAIL_TYPE )
            $body = nl2br($body);
        mailAttachments( PHPFMG_USER, "Password for Your Form Admin Panel", $body, PHPFMG_USER, 'You', "You <" . PHPFMG_USER . ">" );
        echo "<center>Your password has been sent.<br><br><a href='admin.php'>Click here to login again</a></center>";
    };   
    phpfmg_admin_footer();
}


function phpfmg_writable_check(){
 
    if( is_writable( dirname(PHPFMG_SAVE_FILE) ) && is_writable( dirname(PHPFMG_EMAILS_LOGFILE) )  ){
        return ;
    };
?>
<style type="text/css">
    .fmg_warning{
        background-color: #F4F6E5;
        border: 1px dashed #ff0000;
        padding: 16px;
        color : black;
        margin: 10px;
        line-height: 180%;
        width:80%;
    }
    
    .fmg_warning_title{
        font-weight: bold;
    }

</style>
<br><br>
<div class="fmg_warning">
    <div class="fmg_warning_title">Your form data or email traffic log is NOT saving.</div>
    The form data (<?php echo PHPFMG_SAVE_FILE ?>) and email traffic log (<?php echo PHPFMG_EMAILS_LOGFILE?>) will be created automatically when the form is submitted. 
    However, the script doesn't have writable permission to create those files. In order to save your valuable information, please set the directory to writable.
     If you don't know how to do it, please ask for help from your web Administrator or Technical Support of your hosting company.   
</div>
<br><br>
<?php
}


function phpfmg_log_view(){
    $n = isset($_REQUEST['file'])  ? $_REQUEST['file']  : '';
    $files = array(
        1 => PHPFMG_EMAILS_LOGFILE,
        2 => PHPFMG_SAVE_FILE,
    );
    
    phpfmg_admin_header();
   
    $file = $files[$n];
    if( is_file($file) ){
        if( 1== $n ){
            echo "<pre>\n";
            echo join("",file($file) );
            echo "</pre>\n";
        }else{
            $man = new phpfmgDataManager();
            $man->displayRecords();
        };
     

    }else{
        echo "<b>No form data found.</b>";
    };
    phpfmg_admin_footer();
}


function phpfmg_log_download(){
    $n = isset($_REQUEST['file'])  ? $_REQUEST['file']  : '';
    $files = array(
        1 => PHPFMG_EMAILS_LOGFILE,
        2 => PHPFMG_SAVE_FILE,
    );

    $file = $files[$n];
    if( is_file($file) ){
        phpfmg_util_download( $file, PHPFMG_SAVE_FILE == $file ? 'form-data.csv' : 'email-traffics.txt', true, 1 ); // skip the first line
    }else{
        phpfmg_admin_header();
        echo "<b>No email traffic log found.</b>";
        phpfmg_admin_footer();
    };

}


function phpfmg_log_delete(){
    $n = isset($_REQUEST['file'])  ? $_REQUEST['file']  : '';
    $files = array(
        1 => PHPFMG_EMAILS_LOGFILE,
        2 => PHPFMG_SAVE_FILE,
    );
    phpfmg_admin_header();

    $file = $files[$n];
    if( is_file($file) ){
        echo unlink($file) ? "It has been deleted!" : "Failed to delete!" ;
    };
    phpfmg_admin_footer();
}


function phpfmg_util_download($file, $filename='', $toCSV = false, $skipN = 0 ){
    if (!is_file($file)) return false ;

    set_time_limit(0);


    $buffer = "";
    $i = 0 ;
    $fp = @fopen($file, 'rb');
    while( !feof($fp)) { 
        $i ++ ;
        $line = fgets($fp);
        if($i > $skipN){ // skip lines
            if( $toCSV ){ 
              $line = str_replace( chr(0x09), ',', $line );
              $buffer .= phpfmg_data2record( $line, false );
            }else{
                $buffer .= $line;
            };
        }; 
    }; 
    fclose ($fp);
  

    
    /*
        If the Content-Length is NOT THE SAME SIZE as the real conent output, Windows+IIS might be hung!!
    */
    $len = strlen($buffer);
    $filename = basename( '' == $filename ? $file : $filename );
    $file_extension = strtolower(substr(strrchr($filename,"."),1));

    switch( $file_extension ) {
        case "pdf": $ctype="application/pdf"; break;
        case "exe": $ctype="application/octet-stream"; break;
        case "zip": $ctype="application/zip"; break;
        case "doc": $ctype="application/msword"; break;
        case "xls": $ctype="application/vnd.ms-excel"; break;
        case "ppt": $ctype="application/vnd.ms-powerpoint"; break;
        case "gif": $ctype="image/gif"; break;
        case "png": $ctype="image/png"; break;
        case "jpeg":
        case "jpg": $ctype="image/jpg"; break;
        case "mp3": $ctype="audio/mpeg"; break;
        case "wav": $ctype="audio/x-wav"; break;
        case "mpeg":
        case "mpg":
        case "mpe": $ctype="video/mpeg"; break;
        case "mov": $ctype="video/quicktime"; break;
        case "avi": $ctype="video/x-msvideo"; break;
        //The following are for extensions that shouldn't be downloaded (sensitive stuff, like php files)
        case "php":
        case "htm":
        case "html": 
                $ctype="text/plain"; break;
        default: 
            $ctype="application/x-download";
    }
                                            

    //Begin writing headers
    header("Pragma: public");
    header("Expires: 0");
    header("Cache-Control: must-revalidate, post-check=0, pre-check=0");
    header("Cache-Control: public"); 
    header("Content-Description: File Transfer");
    //Use the switch-generated Content-Type
    header("Content-Type: $ctype");
    //Force the download
    header("Content-Disposition: attachment; filename=".$filename.";" );
    header("Content-Transfer-Encoding: binary");
    header("Content-Length: ".$len);
    
    while (@ob_end_clean()); // no output buffering !
    flush();
    echo $buffer ;
    
    return true;
 
    
}
?>